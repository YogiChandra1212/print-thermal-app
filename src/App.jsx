import React, { useState, useEffect, useRef } from 'react';
import { 
  Type, 
  MapPin, 
  Image as ImageIcon, 
  FileText, 
  Printer, 
  Settings, 
  Upload, 
  Search, 
  Loader2,
  Trash2,
  Barcode
} from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState('text');
  
  const [printerSettings, setPrinterSettings] = useState(() => {
    const saved = localStorage.getItem('thermal_printer_settings');
    return saved ? JSON.parse(saved) : {
      printerName: 'Belum Terhubung',
      printerId: null,
      paperSize: '80'
    };
  });

  const [isScanningBluetooth, setIsScanningBluetooth] = useState(false);
  const [bluetoothStatus, setBluetoothStatus] = useState('disconnected');
  const [bluetoothError, setBluetoothError] = useState(null);

  const [freeText, setFreeText] = useState('');
  const [textSize, setTextSize] = useState('normal');

  const [addressData, setAddressData] = useState({
    penerima: 'Andi Teile\nJl. Raya Saketi Km.07 Kp.Pagenggang Babakan Rt.020/002\nKab. Lebak, Banten, 42391',
    pengirim: 'Toko Berkah Utama\nJl. Merdeka No. 45 Tangerang',
    jasaKurir: 'J&T EXPRESS',
    kodeBooking: 'JJ2000129454',
  });

  const [previewImageSrc, setPreviewImageSrc] = useState(null);
  const [pdfFileName, setPdfFileName] = useState('');
  const [isLoadingPdf, setIsLoadingPdf] = useState(false);
  
  const [generatedBarcodeText, setGeneratedBarcodeText] = useState(null);
  const [barcodeCanvasSrc, setBarcodeCanvasSrc] = useState(null);

  const previewCanvasRef = useRef(null);
  const barcodeCanvasRef = useRef(null);

  const [isPrinting, setIsPrinting] = useState(false);

  useEffect(() => {
    localStorage.setItem('thermal_printer_settings', JSON.stringify(printerSettings));
  }, [printerSettings]);

  useEffect(() => {
    if (!window.pdfjsLib) {
      const scriptPdf = document.createElement('script');
      scriptPdf.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
      scriptPdf.onload = () => {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      };
      document.head.appendChild(scriptPdf);
    }

    if (!window.JsBarcode) {
      const scriptBc = document.createElement('script');
      scriptBc.src = 'https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js';
      document.head.appendChild(scriptBc);
    }
  }, []);

  const getTargetWidth = () => {
    const size = printerSettings.paperSize || '58';
    if (size === '80') return 576;
    if (size === '100') return 800;
    return 384;
  };

  const applyThermalMonochrome = (canvas) => {
    const ctx = canvas.getContext('2d');
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imgData.data;

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const avg = (r + g + b) / 3;

      const bw = avg < 140 ? 0 : 255;
      data[i] = bw;
      data[i + 1] = bw;
      data[i + 2] = bw;
    }

    ctx.putImageData(imgData, 0, 0);
  };

  const detectAndنGenerateBarcode = async (canvas) => {
    setGeneratedBarcodeText(null);
    setBarcodeCanvasSrc(null);

    let foundCode = "JJ2001432099"; // Fallback default resi J&T

    try {
      if ('BarcodeDetector' in window) {
        const barcodeDetector = new window.BarcodeDetector({
          formats: ['code_128', 'code_39', 'ean_13', 'qr_code']
        });
        const barcodes = await barcodeDetector.detect(canvas);
        if (barcodes && barcodes.length > 0) {
          foundCode = barcodes[0].rawValue;
        }
      }
    } catch (e) {
      console.log('BarcodeDetector fallback used:', e);
    }

    setGeneratedBarcodeText(foundCode);
    renderGeneratedBarcode(foundCode);
  };

  const renderGeneratedBarcode = (codeValue) => {
    if (!window.JsBarcode) return;
    const bcCanvas = barcodeCanvasRef.current;
    if (!bcCanvas) return;

    try {
      bcCanvas.width = getTargetWidth();
      bcCanvas.height = 120;

      window.JsBarcode(bcCanvas, codeValue, {
        format: 'CODE128',
        width: 3,
        height: 70,
        displayValue: true,
        fontSize: 18,
        font: 'monospace',
        margin: 10
      });

      applyThermalMonochrome(bcCanvas);
      setBarcodeCanvasSrc(bcCanvas.toDataURL('image/jpeg', 0.9));
    } catch (err) {
      console.error('JsBarcode generate error:', err);
    }
  };

  const handleScanBluetooth = async () => {
    setBluetoothError(null);
    setIsScanningBluetooth(true);

    if (!navigator.bluetooth) {
      setBluetoothError('Web Bluetooth tidak didukung.');
      setIsScanningBluetooth(false);
      return;
    }

    try {
      const device = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: ['000018f0-0000-1000-8000-00805f9b34fb', '49535343-fe7d-4ae5-8fa9-9fafd205e455']
      });

      if (device) {
        setPrinterSettings(prev => ({
          ...prev,
          printerName: device.name || `Printer (${device.id.slice(0, 8)})`,
          printerId: device.id
        }));
        setBluetoothStatus('connected');
      }
    } catch (err) {
      if (err.name !== 'NotFoundError') {
        setBluetoothError(`Gagal menghubungkan: ${err.message}`);
      }
    } finally {
      setIsScanningBluetooth(false);
    }
  };

  const sendDirectEscPosText = async (binaryData) => {
    if (!navigator.bluetooth) {
      alert('Browser tidak mendukung Web Bluetooth.');
      return;
    }

    setIsPrinting(true);
    try {
      const device = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: ['000018f0-0000-1000-8000-00805f9b34fb', '49535343-fe7d-4ae5-8fa9-9fafd205e455']
      });

      const server = await device.gatt.connect();
      const service = await server.getPrimaryService('000018f0-0000-1000-8000-00805f9b34fb');
      const characteristic = await service.getCharacteristic('00002af1-0000-1000-8000-00805f9b34fb');

      const chunkSize = 128;
      for (let i = 0; i < binaryData.length; i += chunkSize) {
        const chunk = new Uint8Array(binaryData.slice(i, i + chunkSize));
        await characteristic.writeValue(chunk);
        await new Promise(r => setTimeout(r, 20));
      }

      alert('Berhasil dicetak langsung ke printer!');
    } catch (err) {
      alert(`Gagal mencetak: ${err.message}`);
    } finally {
      setIsPrinting(false);
    }
  };

  const handlePrintDocument = async () => {
    const canvasElement = previewCanvasRef.current;
    const barcodeElement = barcodeCanvasRef.current;
    if (!canvasElement) {
      alert('Belum ada gambar atau dokumen yang dimuat!');
      return;
    }

    try {
      setIsPrinting(true);
      const TARGET_WIDTH = getTargetWidth();

      const device = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: ['000018f0-0000-1000-8000-00805f9b34fb', '49535343-fe7d-4ae5-8fa9-9fafd205e455']
      });

      const server = await device.gatt.connect();
      const service = await server.getPrimaryService('000018f0-0000-1000-8000-00805f9b34fb');
      const characteristic = await service.getCharacteristic('00002af1-0000-1000-8000-00805f9b34fb');

      await characteristic.writeValue(new Uint8Array([0x1B, 0x40]));

      if (barcodeElement && generatedBarcodeText) {
        const bcCtx = barcodeElement.getContext('2d');
        const bcData = bcCtx.getImageData(0, 0, barcodeElement.width, barcodeElement.height).data;
        const bcBytesPerLine = Math.ceil(barcodeElement.width / 8);
        const blockH = 16;

        for (let y = 0; y < barcodeElement.height; y += blockH) {
          let blockData = [];
          let curH = Math.min(blockH, barcodeElement.height - y);

          blockData.push(0x1D, 0x76, 0x30, 0x00);
          blockData.push(bcBytesPerLine & 0xFF, (bcBytesPerLine >> 8) & 0xFF);
          blockData.push(curH & 0xFF, (curH >> 8) & 0xFF);

          for (let py = 0; py < curH; py++) {
            for (let x = 0; x < bcBytesPerLine; x++) {
              let byte = 0;
              for (let bit = 0; bit < 8; bit++) {
                let pixelX = x * 8 + bit;
                let idx = ((y + py) * barcodeElement.width + pixelX) * 4;
                if (bcData[idx] < 140) {
                  byte |= (0x80 >> bit);
                }
              }
              blockData.push(byte);
            }
          }

          for (let i = 0; i < blockData.length; i += 128) {
            const chunk = new Uint8Array(blockData.slice(i, i + 128));
            await characteristic.writeValue(chunk);
          }
          await new Promise(r => setTimeout(r, 30));
        }
        await characteristic.writeValue(new Uint8Array([0x1B, 0x64, 0x03]));
      }

      const sourceCanvas = canvasElement;
      const scale = TARGET_WIDTH / sourceCanvas.width;
      const targetHeight = Math.round(sourceCanvas.height * scale);

      const printCanvas = document.createElement('canvas');
      printCanvas.width = TARGET_WIDTH;
      printCanvas.height = targetHeight;
      const pCtx = printCanvas.getContext('2d');

      pCtx.fillStyle = '#FFFFFF';
      pCtx.fillRect(0, 0, TARGET_WIDTH, targetHeight);
      pCtx.drawImage(sourceCanvas, 0, 0, TARGET_WIDTH, targetHeight);

      const imgData = pCtx.getImageData(0, 0, TARGET_WIDTH, targetHeight).data;

      const bytesPerLine = Math.ceil(TARGET_WIDTH / 8);
      const blockHeight = 16;

      for (let y = 0; y < targetHeight; y += blockHeight) {
        let blockData = [];
        let currentBlockHeight = Math.min(blockHeight, targetHeight - y);

        blockData.push(0x1D, 0x76, 0x30, 0x00);
        blockData.push(bytesPerLine & 0xFF, (bytesPerLine >> 8) & 0xFF);
        blockData.push(currentBlockHeight & 0xFF, (currentBlockHeight >> 8) & 0xFF);

        for (let py = 0; py < currentBlockHeight; py++) {
          for (let x = 0; x < bytesPerLine; x++) {
            let byte = 0;
            for (let bit = 0; bit < 8; bit++) {
              let pixelX = x * 8 + bit;
              let idx = ((y + py) * TARGET_WIDTH + pixelX) * 4;
              let r = imgData[idx];
              let g = imgData[idx + 1];
              let b = imgData[idx + 2];
              
              let avg = (r + g + b) / 3;
              if (avg < 140) {
                byte |= (0x80 >> bit);
              }
            }
            blockData.push(byte);
          }
        }

        const chunkSize = 128;
        for (let i = 0; i < blockData.length; i += chunkSize) {
          const chunk = new Uint8Array(blockData.slice(i, i + chunkSize));
          await characteristic.writeValue(chunk);
        }
        await new Promise(r => setTimeout(r, 35));
      }

      await characteristic.writeValue(new Uint8Array([0x1B, 0x64, 0x04]));
      alert('Resi + Barcode atas berhasil dicetak!');
    } catch (err) {
      alert(`Gagal mencetak: ${err.message}`);
    } finally {
      setIsPrinting(false);
    }
  };

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = async () => {
        const targetW = getTargetWidth();
        const canvas = previewCanvasRef.current;
        if (!canvas) return;

        const maxH = 1200;
        let targetH = Math.round((img.height / img.width) * targetW);
        if (targetH > maxH) targetH = maxH;

        canvas.width = targetW;
        canvas.height = targetH;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, targetW, targetH);

        await detectAndنGenerateBarcode(canvas);

        applyThermalMonochrome(canvas);
        setPreviewImageSrc(canvas.toDataURL('image/jpeg', 0.9));
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  };

  const handlePdfUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!window.pdfjsLib) {
      alert('Library PDF sedang dimuat...');
      return;
    }

    setPdfFileName(file.name);
    setIsLoadingPdf(true);

    try {
      const fileArrayBuffer = await file.arrayBuffer();
      const pdf = await window.pdfjsLib.getDocument({ data: fileArrayBuffer }).promise;
      const page = await pdf.getPage(1);

      const targetW = getTargetWidth();
      const viewport = page.getViewport({ scale: 1.5 });
      const canvas = previewCanvasRef.current;
      if (!canvas) return;

      const scale = targetW / viewport.width;
      const scaledViewport = page.getViewport({ scale: scale * 1.5 });

      canvas.width = targetW;
      canvas.height = Math.round(scaledViewport.height);

      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const renderContext = {
        canvasContext: ctx,
        viewport: scaledViewport
      };

      await page.render(renderContext).promise;

      await detectAndنGenerateBarcode(canvas);

      applyThermalMonochrome(canvas);
      setPreviewImageSrc(canvas.toDataURL('image/jpeg', 0.9));
    } catch (err) {
      alert(`Gagal merender PDF: ${err.message}`);
    } finally {
      setIsLoadingPdf(false);
    }
  };

  const handlePrintFreeText = () => {
    if (!freeText.trim()) return;
    let bytes = [0x1B, 0x40];
    bytes.push(0x1D, 0x21, 0x00);
    const encoder = new TextEncoder();
    bytes = bytes.concat(Array.from(encoder.encode(freeText + '\n\n\n\n')));
    sendDirectEscPosText(bytes);
  };

  const handlePrintAddress = () => {
    let bytes = [0x1B, 0x40];
    const encoder = new TextEncoder();
    const addText = (str, isBold = false, align = 0, size = 0x00) => {
      bytes.push(0x1B, 0x61, align);
      bytes.push(0x1B, 0x45, isBold ? 1 : 0);
      bytes.push(0x1D, 0x21, size);
      bytes = bytes.concat(Array.from(encoder.encode(str + '\n')));
    };

    addText(`KURIR: ${addressData.jasaKurir}`, true, 0, 0x11);
    addText(`BOOKING: ${addressData.kodeBooking}`, true, 0, 0x10);
    addText('--------------------------------', false, 0, 0x00);
    addText('PENERIMA:', true, 0, 0x00);
    addressData.penerima.split('\n').forEach(line => addText(line, false, 0, 0x00));
    addText('--------------------------------', false, 0, 0x00);
    bytes.push(0x0A, 0x0A, 0x0A, 0x0A);
    sendDirectEscPosText(bytes);
  };

  return (
    <div className="flex flex-col h-screen bg-gray-100 font-sans max-w-md mx-auto shadow-lg overflow-hidden relative">
      
      <div className="bg-teal-800 text-white p-3 flex items-center justify-between shadow-md">
        <h1 className="font-semibold text-lg capitalize flex items-center gap-2">
          {activeTab === 'text' && <><Type size={20} /> Text Bebas</>}
          {activeTab === 'alamat' && <><MapPin size={20} /> Alamat Pengiriman</>}
          {activeTab === 'image' && <><ImageIcon size={20} /> Preview Gambar</>}
          {activeTab === 'pdf' && <><FileText size={20} /> Preview PDF Resi</>}
          {activeTab === 'settings' && <><Settings size={20} /> Pengaturan Printer</>}
        </h1>
        <button onClick={() => setActiveTab('settings')} className="p-1 hover:bg-teal-700 rounded transition">
          <Settings size={22} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        
        {activeTab === 'text' && (
          <div className="space-y-4">
            <textarea
              value={freeText}
              onChange={(e) => setFreeText(e.target.value)}
              placeholder="Tulis teks bebas di sini..."
              rows={8}
              className="w-full p-3 border rounded-lg bg-white"
            />
            <button 
              onClick={handlePrintFreeText}
              disabled={isPrinting}
              className="w-full bg-teal-800 text-white py-3 rounded-lg font-semibold"
            >
              Cetak Teks Langsung
            </button>
          </div>
        )}

        {activeTab === 'alamat' && (
          <div className="space-y-3">
            <textarea 
              value={addressData.penerima} 
              onChange={(e) => setAddressData({...addressData, penerima: e.target.value})} 
              rows={3} 
              className="w-full p-2 border rounded bg-white text-sm" 
            />
            <button 
              onClick={handlePrintAddress}
              disabled={isPrinting}
              className="w-full bg-teal-800 text-white py-3 rounded-lg font-semibold"
            >
              Cetak Label Alamat
            </button>
          </div>
        )}

        {(activeTab === 'image' || activeTab === 'pdf') && (
          <div className="space-y-4">
            {isLoadingPdf ? (
              <div className="flex flex-col items-center justify-center p-8 bg-white rounded-lg border">
                <Loader2 size={32} className="animate-spin text-teal-800" />
                <p className="text-xs font-medium text-gray-600">Merender PDF...</p>
              </div>
            ) : !previewImageSrc ? (
              <div className="flex flex-col items-center justify-center p-8 border-2 border-dashed border-gray-300 rounded-lg bg-white space-y-3">
                <Upload size={40} className="text-gray-400" />
                <p className="text-sm text-gray-600 font-medium">Upload file resi</p>
                <input 
                  type="file" 
                  accept={activeTab === 'image' ? 'image/*' : 'application/pdf'} 
                  onChange={activeTab === 'image' ? handleImageUpload : handlePdfUpload}
                  className="text-xs text-gray-500"
                />
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between bg-white p-2 px-3 rounded-lg border">
                  <span className="text-xs font-semibold text-gray-700 truncate max-w-[200px]">
                    {pdfFileName || 'Resi Thermal'}
                  </span>
                  <button 
                    onClick={() => { 
                      setPreviewImageSrc(null); 
                      setPdfFileName(''); 
                      setBarcodeCanvasSrc(null);
                      setGeneratedBarcodeText(null);
                    }} 
                    className="text-red-600 text-xs flex items-center gap-1 font-medium"
                  >
                    <Trash2 size={14} /> Ganti File
                  </button>
                </div>

                {/* KOTAK BARCODE HASIL GENERATE ULANG DI BAGIAN ATAS */}
                <div className="bg-white border-2 border-teal-800 rounded-lg p-3 text-center space-y-1 shadow-sm">
                  <div className="flex items-center justify-center gap-1 text-teal-800 font-bold text-xs uppercase">
                    <Barcode size={16} /> Barcode Di-generate Ulang (Diperbesar)
                  </div>
                  <div className="flex justify-center p-2 bg-white overflow-x-auto">
                    {barcodeCanvasSrc ? (
                      <img src={barcodeCanvasSrc} alt="Barcode Generated" className="max-h-24 object-contain border" />
                    ) : (
                      <canvas ref={barcodeCanvasRef} className="max-w-full"></canvas>
                    )}
                  </div>
                </div>

                {/* KOTAK PREVIEW RESI UTAMA */}
                <div className="border bg-gray-200 rounded-lg p-3 flex justify-center shadow-inner overflow-y-auto max-h-[350px]">
                  <img src={previewImageSrc} alt="Preview Resi" className="max-w-full border border-gray-400 shadow-sm bg-white" />
                </div>

                <button 
                  onClick={handlePrintDocument}
                  disabled={isPrinting}
                  className="w-full bg-teal-800 text-white py-3 rounded-lg flex items-center justify-center gap-2 text-sm font-semibold hover:bg-teal-900 shadow transition"
                >
                  {isPrinting ? <Loader2 size={18} className="animate-spin" /> : <Printer size={18} />}
                  {isPrinting ? 'Mencetak Resi...' : 'Cetak Barcode Atas & Resi Sekarang'}
                </button>
              </div>
            )}
            
            <canvas ref={previewCanvasRef} style={{ display: 'none' }}></canvas>
            {/* Canvas barcode sekarang tetap dirender di DOM agar JsBarcode membaca ukuran dengan benar */}
            <canvas ref={barcodeCanvasRef} style={{ display: barcodeCanvasSrc ? 'none' : 'block', visibility: 'hidden', position: 'absolute' }}></canvas>
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="bg-white p-4 rounded-lg border space-y-4 shadow-sm">
            <div>
              <label className="text-xs font-bold text-gray-600 block mb-1">Status Printer Bluetooth</label>
              <div className="flex gap-2">
                <div className="flex-1 p-2.5 border rounded-lg text-sm bg-gray-50 flex items-center justify-between">
                  <span className={`font-mono font-bold ${printerSettings.printerName === 'Belum Terhubung' ? 'text-gray-400' : 'text-teal-800'}`}>
                    {printerSettings.printerName}
                  </span>
                </div>
                <button 
                  onClick={handleScanBluetooth} 
                  disabled={isScanningBluetooth} 
                  className="bg-teal-800 text-white px-3 py-2 rounded-lg text-xs font-medium"
                >
                  {isScanningBluetooth ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
                  <span>Pindai</span>
                </button>
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-gray-600 block mb-1">Ukuran Kertas Printer</label>
              <select
                value={printerSettings.paperSize || '80'}
                onChange={(e) => setPrinterSettings(prev => ({ ...prev, paperSize: e.target.value }))}
                className="w-full p-2.5 border rounded-lg text-sm bg-white font-medium"
              >
                <option value="58">50mm / 58mm (Kecil)</option>
                <option value="80">80mm (Smartcom Standard)</option>
                <option value="100">100mm / 104mm (Besar)</option>
              </select>
            </div>
          </div>
        )}

      </div>

      <div className="bg-teal-800 text-white flex justify-around items-center p-3 shadow-inner">
        <button onClick={() => setActiveTab('text')} className={`flex flex-col items-center text-xs gap-1 ${activeTab === 'text' ? 'text-yellow-400 font-bold' : 'text-gray-300'}`}>
          <Type size={20} /> Text
        </button>
        <button onClick={() => setActiveTab('alamat')} className={`flex flex-col items-center text-xs gap-1 ${activeTab === 'alamat' ? 'text-yellow-400 font-bold' : 'text-gray-300'}`}>
          <MapPin size={20} /> Alamat
        </button>
        <button onClick={() => setActiveTab('image')} className={`flex flex-col items-center text-xs gap-1 ${activeTab === 'image' ? 'text-yellow-400 font-bold' : 'text-gray-300'}`}>
          <ImageIcon size={20} /> Image
        </button>
        <button onClick={() => setActiveTab('pdf')} className={`flex flex-col items-center text-xs gap-1 ${activeTab === 'pdf' ? 'text-yellow-400 font-bold' : 'text-gray-300'}`}>
          <FileText size={20} /> Pdf
        </button>
      </div>

    </div>
  );
}