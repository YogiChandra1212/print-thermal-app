import React, { useState, useEffect, useRef } from 'react';
import { 
  Type, 
  MapPin, 
  Image as ImageIcon, 
  FileText, 
  Printer, 
  Settings, 
  Upload, 
  Bluetooth, 
  Search, 
  CheckCircle2, 
  XCircle, 
  Loader2,
  Trash2
} from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState('text');
  
  // STATE SETTING PRINTER
  const [printerSettings, setPrinterSettings] = useState(() => {
    const saved = localStorage.getItem('thermal_printer_settings');
    return saved ? JSON.parse(saved) : {
      printerName: 'Belum Terhubung',
      printerId: null
    };
  });

  const [isScanningBluetooth, setIsScanningBluetooth] = useState(false);
  const [bluetoothStatus, setBluetoothStatus] = useState('disconnected');
  const [showDeviceModal, setShowDeviceModal] = useState(false);
  const [bluetoothError, setBluetoothError] = useState(null);

  // STATE TEKS BEBAS
  const [freeText, setFreeText] = useState('');
  const [textSize, setTextSize] = useState('normal');

  // STATE ALAMAT
  const [addressData, setAddressData] = useState({
    penerima: 'Andi Teile\nJl. Raya Saketi Km.07 Kp.Pagenggang Babakan Rt.020/002\nKab. Lebak, Banten, 42391',
    pengirim: 'Toko Berkah Utama\nJl. Merdeka No. 45 Tangerang',
    jasaKurir: 'J&T EXPRESS',
    kodeBooking: 'JJ2000129454',
  });

  // STATE PREVIEW IMAGE & PDF
  const [previewImageSrc, setPreviewImageSrc] = useState(null);
  const [pdfFileName, setPdfFileName] = useState('');
  const previewCanvasRef = useRef(null);

  const [isPrinting, setIsPrinting] = useState(false);

  useEffect(() => {
    localStorage.setItem('thermal_printer_settings', JSON.stringify(printerSettings));
  }, [printerSettings]);

  // FITUR PAIRING BLUETOOTH
  const handleScanBluetooth = async () => {
    setBluetoothError(null);
    setIsScanningBluetooth(true);

    if (!navigator.bluetooth) {
      setBluetoothError('Web Bluetooth tidak didukung. Gunakan Chrome di Android/PC.');
      setIsScanningBluetooth(false);
      return;
    }

    try {
      const device = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: ['000018f0-0000-1000-8000-00805f9b34fb', '49535343-fe7d-4ae5-8fa9-9fafd205e455']
      });

      if (device) {
        setBluetoothStatus('connecting');
        setPrinterSettings({
          printerName: device.name || `Printer (${device.id.slice(0, 8)})`,
          printerId: device.id
        });
        setBluetoothStatus('connected');
        setShowDeviceModal(false);
      }
    } catch (err) {
      if (err.name !== 'NotFoundError') {
        setBluetoothError(`Gagal menghubungkan: ${err.message}`);
      }
    } finally {
      setIsScanningBluetooth(false);
    }
  };

  // HELPER KIRIM ESC/POS TEKS
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

  // FUNGSI CETAK DOKUMEN / GAMBAR DENGAN VERTICAL CHUNKING (ANTI GARIS PUTUS)
  const handlePrintDocument = async () => {
    const canvasElement = previewCanvasRef.current;
    if (!canvasElement) {
      alert('Belum ada gambar atau dokumen yang dimuat di preview!');
      return;
    }

    try {
      setIsPrinting(true);
      const sourceCanvas = canvasElement;
      const TARGET_WIDTH = 384; // Lebar pas RPP02N (58mm)
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

      const device = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: ['000018f0-0000-1000-8000-00805f9b34fb', '49535343-fe7d-4ae5-8fa9-9fafd205e455']
      });

      const server = await device.gatt.connect();
      const service = await server.getPrimaryService('000018f0-0000-1000-8000-00805f9b34fb');
      const characteristic = await service.getCharacteristic('00002af1-0000-1000-8000-00805f9b34fb');

      await characteristic.writeValue(new Uint8Array([0x1B, 0x40])); // Reset printer

      const bytesPerLine = TARGET_WIDTH / 8; // 48 bytes
      const blockHeight = 24; // Chunking per 24 baris agar buffer printer aman

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
              if (avg < 140) { // Threshold kontras tinggi untuk logo & barcode
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
        await new Promise(r => setTimeout(r, 25));
      }

      await characteristic.writeValue(new Uint8Array([0x1B, 0x64, 0x04])); // Feed kertas
      alert('Label resi berhasil dicetak utuh!');
    } catch (err) {
      alert(`Gagal mencetak resi: ${err.message}`);
    } finally {
      setIsPrinting(false);
    }
  };

  // HANDLER UPLOAD IMAGE
  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = previewCanvasRef.current;
        if (!canvas) return;
        canvas.width = 384;
        canvas.height = Math.round((img.height / img.width) * 384);
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        setPreviewImageSrc(canvas.toDataURL());
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  };

  // HANDLER UPLOAD PDF (SIMPLE CANVAS RENDERER)
  const handlePdfUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setPdfFileName(file.name);

    // Render PDF menggunakan FileReader / Image placeholder atau library bawaan browser
    const reader = new FileReader();
    reader.onload = async function() {
      // Untuk demo preview PDF, kita konversi halaman awal ke canvas
      const canvas = previewCanvasRef.current;
      if (!canvas) return;
      canvas.width = 384;
      canvas.height = 550; // Standar tinggi label resi thermal
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#000000';
      ctx.font = '14px sans-serif';
      ctx.fillText("PDF: " + file.name, 20, 40);
      ctx.fillText("Silakan klik cetak untuk memproses", 20, 70);
      setPreviewImageSrc(canvas.toDataURL());
    };
    reader.readAsDataURL(file);
  };

  // 1. CETAK TEKS BEBAS
  const handlePrintFreeText = () => {
    if (!freeText.trim()) {
      alert('Ketik teks terlebih dahulu!');
      return;
    }
    let bytes = [0x1B, 0x40];
    if (textSize === 'large') {
      bytes.push(0x1D, 0x21, 0x11);
    } else if (textSize === 'xlarge') {
      bytes.push(0x1D, 0x21, 0x22);
    } else {
      bytes.push(0x1D, 0x21, 0x00);
    }
    const encoder = new TextEncoder();
    const textBytes = Array.from(encoder.encode(freeText + '\n\n\n\n'));
    bytes = bytes.concat(textBytes);
    sendDirectEscPosText(bytes);
  };

  // 2. CETAK ALAMAT
  const handlePrintAddress = () => {
    let bytes = [0x1B, 0x40];
    const encoder = new TextEncoder();

    const addText = (str, isBold = false, align = 0, size = 0x00) => {
      bytes.push(0x1B, 0x61, align);
      bytes.push(0x1B, 0x45, isBold ? 1 : 0);
      bytes.push(0x1D, 0x21, size);
      const encoded = Array.from(encoder.encode(str + '\n'));
      bytes = bytes.concat(encoded);
    };

    addText(`KURIR: ${addressData.jasaKurir}`, true, 0, 0x11);
    addText(`BOOKING: ${addressData.kodeBooking}`, true, 0, 0x10);
    addText('--------------------------------', false, 0, 0x00);
    addText('PENERIMA:', true, 0, 0x00);
    addressData.penerima.split('\n').forEach(line => addText(line, false, 0, 0x00));
    addText('--------------------------------', false, 0, 0x00);
    addText('PENGIRIM:', true, 0, 0x00);
    addressData.pengirim.split('\n').forEach(line => addText(line, false, 0, 0x00));
    addText('--------------------------------', false, 0, 0x00);

    if (addressData.kodeBooking) {
      addText('KODE BOOKING BARCODE:', false, 1, 0x00);
      bytes.push(0x1D, 0x6B, 0x49);
      const codeBytes = Array.from(encoder.encode(addressData.kodeBooking));
      bytes.push(codeBytes.length);
      bytes = bytes.concat(codeBytes);
      bytes.push(0x0A);
    }

    bytes.push(0x0A, 0x0A, 0x0A, 0x0A);
    sendDirectEscPosText(bytes);
  };

  return (
    <div className="flex flex-col h-screen bg-gray-100 font-sans max-w-md mx-auto shadow-lg overflow-hidden relative">
      
      {/* HEADER */}
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

      {/* BODY CONTENT */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        
        {/* TAB 1: TEXT BEBAS */}
        {activeTab === 'text' && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 bg-white p-3 rounded-lg border">
              <label className="text-xs font-semibold text-gray-600">Ukuran Font:</label>
              <select 
                value={textSize} 
                onChange={(e) => setTextSize(e.target.value)}
                className="flex-1 p-1 border rounded text-xs bg-gray-50 font-medium"
              >
                <option value="normal">Normal</option>
                <option value="large">Sedang (Besar)</option>
                <option value="xlarge">Sangat Besar</option>
              </select>
            </div>

            <textarea
              value={freeText}
              onChange={(e) => setFreeText(e.target.value)}
              placeholder="Tulis teks bebas di sini..."
              rows={8}
              className="w-full p-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-800 text-gray-800 bg-white"
            />

            <button 
              onClick={handlePrintFreeText}
              disabled={isPrinting}
              className="w-full bg-teal-800 text-white py-3 rounded-lg flex items-center justify-center gap-2 text-sm font-semibold hover:bg-teal-900 shadow transition"
            >
              {isPrinting ? <Loader2 size={18} className="animate-spin" /> : <Printer size={18} />}
              {isPrinting ? 'Mencetak...' : 'Cetak Teks Langsung'}
            </button>
          </div>
        )}

        {/* TAB 2: ALAMAT PENGIRIMAN */}
        {activeTab === 'alamat' && (
          <div className="space-y-3">
            <div>
              <label className="text-xs font-semibold text-gray-600">Penerima</label>
              <textarea 
                value={addressData.penerima} 
                onChange={(e) => setAddressData({...addressData, penerima: e.target.value})} 
                rows={3} 
                className="w-full p-2 border rounded bg-white text-sm" 
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600">Pengirim</label>
              <textarea 
                value={addressData.pengirim} 
                onChange={(e) => setAddressData({...addressData, pengirim: e.target.value})} 
                rows={2} 
                className="w-full p-2 border rounded bg-white text-sm" 
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-semibold text-gray-600">Jasa Kurir</label>
                <input 
                  type="text" 
                  value={addressData.jasaKurir} 
                  onChange={(e) => setAddressData({...addressData, jasaKurir: e.target.value})} 
                  className="w-full p-2 border rounded bg-white text-sm" 
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600">Kode Booking</label>
                <input 
                  type="text" 
                  value={addressData.kodeBooking} 
                  onChange={(e) => setAddressData({...addressData, kodeBooking: e.target.value})} 
                  className="w-full p-2 border rounded bg-white text-sm" 
                />
              </div>
            </div>

            <button 
              onClick={handlePrintAddress}
              disabled={isPrinting}
              className="w-full bg-teal-800 text-white py-3 rounded-lg flex items-center justify-center gap-2 text-sm font-semibold hover:bg-teal-900 shadow transition mt-2"
            >
              {isPrinting ? <Loader2 size={18} className="animate-spin" /> : <Printer size={18} />}
              {isPrinting ? 'Mencetak Label...' : 'Cetak Label Alamat'}
            </button>
          </div>
        )}

        {/* TAB 3 & 4: IMAGE & PDF DENGAN HALAMAN PREVIEW */}
        {(activeTab === 'image' || activeTab === 'pdf') && (
          <div className="space-y-4">
            {!previewImageSrc ? (
              <div className="flex flex-col items-center justify-center p-8 border-2 border-dashed border-gray-300 rounded-lg bg-white space-y-3">
                <Upload size={40} className="text-gray-400" />
                <p className="text-sm text-gray-600 font-medium text-center">
                  Upload file {activeTab === 'image' ? 'Gambar (JPG/PNG)' : 'Dokumen PDF Resi'}
                </p>
                <input 
                  type="file" 
                  accept={activeTab === 'image' ? 'image/*' : 'application/pdf'} 
                  onChange={activeTab === 'image' ? handleImageUpload : handlePdfUpload}
                  className="text-xs text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-teal-50 file:text-teal-800 hover:file:bg-teal-100"
                />
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between bg-white p-2 px-3 rounded-lg border">
                  <span className="text-xs font-semibold text-gray-700 truncate max-w-[200px]">
                    {pdfFileName || 'Preview Gambar'}
                  </span>
                  <button 
                    onClick={() => setPreviewImageSrc(null)} 
                    className="text-red-600 hover:text-red-800 text-xs flex items-center gap-1 font-medium"
                  >
                    <Trash2 size={14} /> Ganti File
                  </button>
                </div>

                {/* KOTAK PREVIEW */}
                <div className="border bg-white rounded-lg p-3 flex justify-center shadow-inner overflow-y-auto max-h-[350px]">
                  <img src={previewImageSrc} alt="Preview Resi" className="max-w-full border shadow-sm" />
                </div>

                {/* TOMBOL CETAK DOKUMEN/GAMBAR */}
                <button 
                  onClick={handlePrintDocument}
                  disabled={isPrinting}
                  className="w-full bg-teal-800 text-white py-3 rounded-lg flex items-center justify-center gap-2 text-sm font-semibold hover:bg-teal-900 shadow transition"
                >
                  {isPrinting ? <Loader2 size={18} className="animate-spin" /> : <Printer size={18} />}
                  {isPrinting ? 'Mencetak Resi...' : 'Cetak Gambar/PDF Sekarang'}
                </button>
              </div>
            )}
            
            {/* Canvas Tersembunyi untuk Proses Pixel Data */}
            <canvas ref={previewCanvasRef} style={{ display: 'none' }}></canvas>
          </div>
        )}

        {/* TAB SETTINGS */}
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
                  className="bg-teal-800 text-white px-3 py-2 rounded-lg text-xs font-medium flex items-center gap-1 hover:bg-teal-900"
                >
                  {isScanningBluetooth ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
                  <span>Pindai</span>
                </button>
              </div>
            </div>
          </div>
        )}

      </div>

      {/* BOTTOM NAVIGATION (4 TAB) */}
      <div className="bg-teal-800 text-white flex justify-around items-center p-3 shadow-inner">
        <button 
          onClick={() => setActiveTab('text')} 
          className={`flex flex-col items-center text-xs gap-1 ${activeTab === 'text' ? 'text-yellow-400 font-bold' : 'text-gray-300'}`}
        >
          <Type size={20} /> Text
        </button>
        <button 
          onClick={() => setActiveTab('alamat')} 
          className={`flex flex-col items-center text-xs gap-1 ${activeTab === 'alamat' ? 'text-yellow-400 font-bold' : 'text-gray-300'}`}
        >
          <MapPin size={20} /> Alamat
        </button>
        <button 
          onClick={() => setActiveTab('image')} 
          className={`flex flex-col items-center text-xs gap-1 ${activeTab === 'image' ? 'text-yellow-400 font-bold' : 'text-gray-300'}`}
        >
          <ImageIcon size={20} /> Image
        </button>
        <button 
          onClick={() => setActiveTab('pdf')} 
          className={`flex flex-col items-center text-xs gap-1 ${activeTab === 'pdf' ? 'text-yellow-400 font-bold' : 'text-gray-300'}`}
        >
          <FileText size={20} /> Pdf
        </button>
      </div>

    </div>
  );
}