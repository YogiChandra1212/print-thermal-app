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
  Sliders,
  Crop
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

  // STATE TEXT BEBAS SEMULA
  const [freeText, setFreeText] = useState('');
  const [textSize, setTextSize] = useState('normal');

  // STATE ALAMAT SEMULA
  const [addressData, setAddressData] = useState({
    penerima: 'Andi Teile\nJl. Raya Saketi Km.07 Kp.Pagenggang Babakan Rt.020/002\nKab. Lebak, Banten, 42391',
    pengirim: 'Toko Berkah Utama\nJl. Merdeka No. 45 Tangerang',
    jasaKurir: 'J&T EXPRESS',
    kodeBooking: 'JJ2000129454',
  });

  const [previewImageSrc, setPreviewImageSrc] = useState(null);
  const [pdfFileName, setPdfFileName] = useState('');
  const [isLoadingPdf, setIsLoadingPdf] = useState(false);
  
  const [contrastMode, setContrastMode] = useState('threshold140');
  const [rawFileImage, setRawFileImage] = useState(null);

  const [generatedBarcodeText, setGeneratedBarcodeText] = useState(null);
  const [barcodeCanvasSrc, setBarcodeCanvasSrc] = useState(null);

  const [cropBox, setCropBox] = useState({ top: 5, bottom: 70, left: 5, right: 95 });

  const previewCanvasRef = useRef(null);
  const barcodeCanvasRef = useRef(null);
  const combinedCanvasRef = useRef(null);

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
    const size = printerSettings.paperSize || '80';
    if (size === '100') return 576; // Diubah ke 576 dots agar kompatibel penuh dengan buffer raster Xprinter & tidak blank putih
    if (size === '80') return 576;
    return 384;
  };

  const applyContrastFilter = (canvas, mode) => {
    const ctx = canvas.getContext('2d');
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imgData.data;
    const width = canvas.width;
    const height = canvas.height;

    const gray = new Float32Array(width * height);
    for (let i = 0, j = 0; i < data.length; i += 4, j++) {
      gray[j] = (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114);
    }

    if (mode === 'none') {
      for (let i = 0, j = 0; i < data.length; i += 4, j++) {
        let val = gray[j];
        data[i] = val; data[i + 1] = val; data[i + 2] = val;
      }
    } else if (mode === 'threshold127' || mode === 'threshold140') {
      const limit = mode === 'threshold140' ? 140 : 127;
      for (let i = 0, j = 0; i < data.length; i += 4, j++) {
        let bw = gray[j] < limit ? 0 : 255;
        data[i] = bw; data[i + 1] = bw; data[i + 2] = bw;
      }
    } else if (mode === 'atkinson') {
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          let idx = y * width + x;
          let oldPixel = gray[idx];
          let newPixel = oldPixel < 128 ? 0 : 255;
          gray[idx] = newPixel;
          let err = (oldPixel - newPixel) / 8;

          if (x + 1 < width) gray[idx + 1] += err;
          if (x + 2 < width) gray[idx + 2] += err;
          if (y + 1 < height) {
            if (x - 1 >= 0) gray[(y + 1) * width + (x - 1)] += err;
            gray[(y + 1) * width + x] += err;
            if (x + 1 < width) gray[(y + 1) * width + (x + 1)] += err;
          }
          if (y + 2 < height) gray[(y + 2) * width + x] += err;
        }
      }
      for (let i = 0, j = 0; i < data.length; i += 4, j++) {
        let bw = gray[j] < 128 ? 0 : 255;
        data[i] = bw; data[i + 1] = bw; data[i + 2] = bw;
      }
    } else if (mode === 'floyd' || mode === 'dither') {
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          let idx = y * width + x;
          let oldPixel = gray[idx];
          let newPixel = oldPixel < 128 ? 0 : 255;
          gray[idx] = newPixel;
          let err = oldPixel - newPixel;

          if (x + 1 < width) gray[idx + 1] += err * 7 / 16;
          if (y + 1 < height) {
            if (x - 1 >= 0) gray[(y + 1) * width + (x - 1)] += err * 3 / 16;
            gray[(y + 1) * width + x] += err * 5 / 16;
            if (x + 1 < width) gray[(y + 1) * width + (x + 1)] += err * 1 / 16;
          }
        }
      }
      for (let i = 0, j = 0; i < data.length; i += 4, j++) {
        let bw = gray[j] < 128 ? 0 : 255;
        data[i] = bw; data[i + 1] = bw; data[i + 2] = bw;
      }
    }

    ctx.putImageData(imgData, 0, 0);
  };

  useEffect(() => {
    if (!rawFileImage) return;
    processAndDisplayImage(rawFileImage, contrastMode);
  }, [contrastMode, printerSettings.paperSize]);

  const processAndDisplayImage = (imgElement, mode) => {
    const targetW = getTargetWidth();
    const canvas = previewCanvasRef.current;
    if (!canvas) return;

    const maxH = 1800;
    let targetH = Math.round((imgElement.height / imgElement.width) * targetW);
    if (targetH > maxH) targetH = maxH;

    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(imgElement, 0, 0, targetW, targetH);

    applyContrastFilter(canvas, mode);
    setPreviewImageSrc(canvas.toDataURL('image/jpeg', 0.9));
  };

  const detectAndGenerateBarcode = async (canvas) => {
    let foundCode = "JJ2001432099";
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
      console.log('Barcode fallback:', e);
    }

    setGeneratedBarcodeText(foundCode);
    renderGeneratedBarcode(foundCode, contrastMode);
  };

  const renderGeneratedBarcode = (codeValue, mode) => {
    if (!window.JsBarcode) return;
    const bcCanvas = barcodeCanvasRef.current;
    if (!bcCanvas) return;

    try {
      const targetW = getTargetWidth();
      bcCanvas.width = targetW;
      bcCanvas.height = 140;

      let barWidthScale = targetW === 576 ? 3 : 2;

      window.JsBarcode(bcCanvas, codeValue, {
        format: 'CODE128',
        width: barWidthScale,
        height: 80,
        displayValue: true,
        fontSize: 18,
        font: 'monospace',
        margin: 15
      });

      applyContrastFilter(bcCanvas, mode);
      setBarcodeCanvasSrc(bcCanvas.toDataURL('image/jpeg', 0.9));
    } catch (err) {
      console.error('Barcode error:', err);
    }
  };

  const handleScanBluetooth = async () => {
    setBluetoothError(null);
    setIsScanningBluetooth(true);
    if (!navigator.bluetooth) {
      alert('Browser tidak mendukung Web Bluetooth.');
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
      if (err.name !== 'NotFoundError') alert(`Gagal: ${err.message}`);
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
      alert('Berhasil dicetak!');
    } catch (err) {
      alert(`Gagal: ${err.message}`);
    } finally {
      setIsPrinting(false);
    }
  };

  // PENCETAKAN IMAGE / PDF DENGAN STABILITAS XPRINTER & SMARTCOM
  const handlePrintDocument = async () => {
    const resiCanvas = previewCanvasRef.current;
    const barcodeCanvas = barcodeCanvasRef.current;

    if (!resiCanvas) {
      alert('Belum ada gambar yang dimuat!');
      return;
    }

    try {
      setIsPrinting(true);
      const TARGET_WIDTH = getTargetWidth();

      const cropX = Math.round((cropBox.left / 100) * resiCanvas.width);
      const cropY = Math.round((cropBox.top / 100) * resiCanvas.height);
      const cropW = Math.round(((cropBox.right - cropBox.left) / 100) * resiCanvas.width);
      const cropH = Math.round(((cropBox.bottom - cropBox.top) / 100) * resiCanvas.height);

      const croppedCanvas = document.createElement('canvas');
      const scaleFactor = TARGET_WIDTH / cropW;
      croppedCanvas.width = TARGET_WIDTH;
      croppedCanvas.height = Math.round(cropH * scaleFactor);
      
      const cCtx = croppedCanvas.getContext('2d');
      cCtx.fillStyle = '#FFFFFF';
      cCtx.fillRect(0, 0, croppedCanvas.width, croppedCanvas.height);
      cCtx.drawImage(
        resiCanvas, 
        cropX, cropY, cropW, cropH, 
        0, 0, croppedCanvas.width, croppedCanvas.height
      );

      const combinedCanvas = combinedCanvasRef.current;
      const bcH = barcodeCanvas ? barcodeCanvas.height : 0;
      const resiH = croppedCanvas.height;

      combinedCanvas.width = TARGET_WIDTH;
      combinedCanvas.height = bcH + resiH + 20;

      const comboCtx = combinedCanvas.getContext('2d');
      comboCtx.fillStyle = '#FFFFFF';
      comboCtx.fillRect(0, 0, combinedCanvas.width, combinedCanvas.height);

      if (barcodeCanvas && generatedBarcodeText) {
        const bcDrawX = Math.round((TARGET_WIDTH - barcodeCanvas.width) / 2);
        comboCtx.drawImage(barcodeCanvas, bcDrawX < 0 ? 0 : bcDrawX, 0);
      }

      comboCtx.drawImage(croppedCanvas, 0, bcH + 10);

      const finalImageData = comboCtx.getImageData(0, 0, TARGET_WIDTH, combinedCanvas.height).data;

      const device = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: ['000018f0-0000-1000-8000-00805f9b34fb', '49535343-fe7d-4ae5-8fa9-9fafd205e455']
      });
      const server = await device.gatt.connect();
      const service = await server.getPrimaryService('000018f0-0000-1000-8000-00805f9b34fb');
      const characteristic = await service.getCharacteristic('00002af1-0000-1000-8000-00805f9b34fb');

      // Reset Printer
      await characteristic.writeValue(new Uint8Array([0x1B, 0x40]));
      await new Promise(r => setTimeout(r, 60));

      const bytesPerLine = Math.ceil(TARGET_WIDTH / 8);
      const totalHeight = combinedCanvas.height;
      const blockHeight = 24; // Dioptimalkan untuk Xprinter

      for (let y = 0; y < totalHeight; y += blockHeight) {
        let blockData = [];
        let curBlockH = Math.min(blockHeight, totalHeight - y);

        blockData.push(0x1D, 0x76, 0x30, 0x00);
        blockData.push(bytesPerLine & 0xFF, (bytesPerLine >> 8) & 0xFF);
        blockData.push(curBlockH & 0xFF, (curBlockH >> 8) & 0xFF);

        for (let py = 0; py < curBlockH; py++) {
          for (let x = 0; x < bytesPerLine; x++) {
            let byte = 0;
            for (let bit = 0; bit < 8; bit++) {
              let pixelX = x * 8 + bit;
              let idx = ((y + py) * TARGET_WIDTH + pixelX) * 4;
              
              if (pixelX < TARGET_WIDTH) {
                let r = finalImageData[idx];
                let g = finalImageData[idx + 1];
                let b = finalImageData[idx + 2];
                let avg = (r + g + b) / 3;

                if (avg < 140) {
                  byte |= (0x80 >> bit);
                }
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
        await new Promise(r => setTimeout(r, 40));
      }

      await characteristic.writeValue(new Uint8Array([0x1B, 0x64, 0x04]));
      alert('Resi berhasil dicetak!');
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
        setRawFileImage(img);
        processAndDisplayImage(img, contrastMode);
        
        setTimeout(async () => {
          if (previewCanvasRef.current) {
            await detectAndGenerateBarcode(previewCanvasRef.current);
          }
        }, 100);
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
      const viewport = page.getViewport({ scale: 2.0 });
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = viewport.width;
      tempCanvas.height = viewport.height;
      const tempCtx = tempCanvas.getContext('2d');

      await page.render({ canvasContext: tempCtx, viewport }).promise;

      const img = new Image();
      img.onload = async () => {
        setRawFileImage(img);
        processAndDisplayImage(img, contrastMode);
        await detectAndGenerateBarcode(previewCanvasRef.current);
        setIsLoadingPdf(false);
      };
      img.src = tempCanvas.toDataURL();
    } catch (err) {
      alert(`Gagal PDF: ${err.message}`);
      setIsLoadingPdf(false);
    }
  };

  // FITUR TEXT BEBAS DIKEMBALIKAN SEPERTI SEMULA
  const handlePrintFreeText = () => {
    if (!freeText.trim()) return;
    let bytes = [0x1B, 0x40];
    bytes.push(0x1D, 0x21, textSize === 'large' ? 0x11 : 0x00);
    const encoder = new TextEncoder();
    bytes = bytes.concat(Array.from(encoder.encode(freeText + '\n\n\n\n')));
    sendDirectEscPosText(bytes);
  };

  // FITUR ALAMAT DIKEMBALIKAN SEPERTI SEMULA
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
    addText('PENGIRIM:', true, 0, 0x00);
    addressData.pengirim.split('\n').forEach(line => addText(line, false, 0, 0x00));
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
          <div className="space-y-4 bg-white p-4 rounded-lg border shadow-sm">
            <div>
              <label className="text-xs font-bold text-gray-600 block mb-1">Ukuran Font</label>
              <select 
                value={textSize} 
                onChange={(e) => setTextSize(e.target.value)}
                className="w-full p-2.5 border rounded-lg text-sm bg-white"
              >
                <option value="normal">Normal</option>
                <option value="large">Besar / Double</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-bold text-gray-600 block mb-1">Isi Teks Bebas</label>
              <textarea
                value={freeText}
                onChange={(e) => setFreeText(e.target.value)}
                placeholder="Tulis teks bebas di sini..."
                rows={6}
                className="w-full p-3 border rounded-lg bg-white text-sm"
              />
            </div>
            <button 
              onClick={handlePrintFreeText}
              disabled={isPrinting}
              className="w-full bg-teal-800 text-white py-3 rounded-lg font-semibold hover:bg-teal-900 shadow transition"
            >
              Cetak Teks Langsung
            </button>
          </div>
        )}

        {activeTab === 'alamat' && (
          <div className="space-y-3 bg-white p-4 rounded-lg border shadow-sm">
            <div>
              <label className="text-xs font-bold text-gray-600 block mb-1">Jasa Kurir</label>
              <input 
                type="text" 
                value={addressData.jasaKurir} 
                onChange={(e) => setAddressData({...addressData, jasaKurir: e.target.value})} 
                className="w-full p-2.5 border rounded text-sm bg-white font-semibold" 
              />
            </div>
            <div>
              <label className="text-xs font-bold text-gray-600 block mb-1">Kode Booking / Resi</label>
              <input 
                type="text" 
                value={addressData.kodeBooking} 
                onChange={(e) => setAddressData({...addressData, kodeBooking: e.target.value})} 
                className="w-full p-2.5 border rounded text-sm bg-white font-mono font-bold" 
              />
            </div>
            <div>
              <label className="text-xs font-bold text-gray-600 block mb-1">Pengirim</label>
              <textarea 
                value={addressData.pengirim} 
                onChange={(e) => setAddressData({...addressData, pengirim: e.target.value})} 
                rows={2} 
                className="w-full p-2.5 border rounded bg-white text-sm" 
              />
            </div>
            <div>
              <label className="text-xs font-bold text-gray-600 block mb-1">Penerima</label>
              <textarea 
                value={addressData.penerima} 
                onChange={(e) => setAddressData({...addressData, penerima: e.target.value})} 
                rows={3} 
                className="w-full p-2.5 border rounded bg-white text-sm" 
              />
            </div>
            <button 
              onClick={handlePrintAddress}
              disabled={isPrinting}
              className="w-full bg-teal-800 text-white py-3 rounded-lg font-semibold hover:bg-teal-900 shadow transition"
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
                <input type="file" accept={activeTab === 'image' ? 'image/*' : 'application/pdf'} onChange={activeTab === 'image' ? handleImageUpload : handlePdfUpload} className="text-xs text-gray-500" />
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between bg-white p-2 px-3 rounded-lg border">
                  <span className="text-xs font-semibold text-gray-700 truncate max-w-[180px]">
                    {pdfFileName || 'Resi Thermal'}
                  </span>
                  <button onClick={() => { setPreviewImageSrc(null); setPdfFileName(''); setRawFileImage(null); setBarcodeCanvasSrc(null); }} className="text-red-600 text-xs flex items-center gap-1 font-medium">
                    <Trash2 size={14} /> Ganti File
                  </button>
                </div>

                <div className="flex items-center gap-2 bg-white p-2.5 rounded-lg border shadow-sm">
                  <Sliders size={18} className="text-teal-800" />
                  <div className="flex-1">
                    <label className="text-[10px] font-bold text-gray-500 block uppercase">Mode Kontras & Filter</label>
                    <select
                      value={contrastMode}
                      onChange={(e) => setContrastMode(e.target.value)}
                      className="w-full text-xs font-semibold text-gray-800 bg-transparent focus:outline-none cursor-pointer"
                    >
                      <option value="threshold140">Kontras Terbaik (Threshold 140 - Paling Pekat)</option>
                      <option value="threshold127">Standard (Threshold 127)</option>
                      <option value="atkinson">Atkinson Dithering (Halus & Detail Foto)</option>
                      <option value="floyd">Floyd-Steinberg (Dithering SF)</option>
                      <option value="none">Ubah Ukuran Saja (Grayscale Asli)</option>
                    </select>
                  </div>
                </div>

                <div className="bg-white border-2 border-teal-800 rounded-lg p-2 text-center shadow-sm">
                  <div className="flex justify-center bg-white overflow-x-auto">
                    {barcodeCanvasSrc && (
                      <img src={barcodeCanvasSrc} alt="Barcode" className="max-h-24 object-contain" />
                    )}
                  </div>
                </div>

                <div className="space-y-2 bg-white p-3 rounded-lg border">
                  <div className="flex items-center justify-between text-xs font-bold text-gray-600">
                    <span className="flex items-center gap-1"><Crop size={14} /> Atur Batas Crop Resi</span>
                    <span className="text-[10px] text-teal-800 font-semibold">Geser slider untuk memotong bagian</span>
                  </div>

                  <div className="relative border bg-gray-300 rounded overflow-hidden flex justify-center max-h-[280px]">
                    <img src={previewImageSrc} alt="Preview Crop" className="max-w-full object-contain" />
                    
                    <div 
                      className="absolute border-2 border-red-500 bg-red-500/10 pointer-events-none"
                      style={{
                        top: `${cropBox.top}%`,
                        bottom: `${100 - cropBox.bottom}%`,
                        left: `${cropBox.left}%`,
                        right: `${100 - cropBox.right}%`
                      }}
                    ></div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 pt-2 text-xs">
                    <div>
                      <label className="text-[10px] font-bold text-gray-500 block">Potong Atas: {cropBox.top}%</label>
                      <input 
                        type="range" min="0" max="45" value={cropBox.top} 
                        onChange={(e) => setCropBox({...cropBox, top: Number(e.target.value)})}
                        className="w-full accent-red-600 cursor-pointer"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-gray-500 block">Potong Bawah: {100 - cropBox.bottom}%</label>
                      <input 
                        type="range" min="50" max="100" value={cropBox.bottom} 
                        onChange={(e) => setCropBox({...cropBox, bottom: Number(e.target.value)})}
                        className="w-full accent-red-600 cursor-pointer"
                      />
                    </div>
                  </div>
                </div>

                <button onClick={handlePrintDocument} disabled={isPrinting} className="w-full bg-teal-800 text-white py-3 rounded-lg flex items-center justify-center gap-2 text-sm font-semibold hover:bg-teal-900 shadow transition">
                  {isPrinting ? <Loader2 size={18} className="animate-spin" /> : <Printer size={18} />}
                  {isPrinting ? 'Mencetak...' : 'Cetak Hasil Crop Sekarang'}
                </button>
              </div>
            )}
            
            <canvas ref={previewCanvasRef} style={{ display: 'none' }}></canvas>
            <canvas ref={barcodeCanvasRef} style={{ display: 'none' }}></canvas>
            <canvas ref={combinedCanvasRef} style={{ display: 'none' }}></canvas>
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
                <button onClick={handleScanBluetooth} disabled={isScanningBluetooth} className="bg-teal-800 text-white px-3 py-2 rounded-lg text-xs font-medium">
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
                <option value="80">80mm (Smartcom Standard / RPP300)</option>
                <option value="100">100mm / 104mm (Xprinter)</option>
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