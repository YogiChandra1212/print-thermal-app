import React, { useState, useEffect } from 'react';
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
  Loader2 
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
  const [textSize, setTextSize] = useState('normal'); // 'normal', 'large', 'xlarge'

  // STATE ALAMAT
  const [addressData, setAddressData] = useState({
    penerima: 'Andi Teile\nJl. Raya Saketi Km.07 Kp.Pagenggang Babakan Rt.020/002\nKab. Lebak, Banten, 42391',
    pengirim: 'Toko Berkah Utama\nJl. Merdeka No. 45 Tangerang',
    jasaKurir: 'J&T EXPRESS',
    kodeBooking: 'JJ2000129454',
  });

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

  // HELPER UNTUK KIRIM COMMAND ESC/POS TEKS LANGSUNG
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

      // Kirim data byte bertahap
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

  // Tambahkan library pembaca PDF jika belum ada (bisa pakai pdfjs-dist via CDN atau npm)
// Pastikan canvas merender dengan lebar persis 384px untuk RPP02N

  const handlePrintDocument = async (canvasElement) => {
    if (!canvasElement) return;

    try {
      setIsPrinting(true);
      const sourceCanvas = canvasElement;
      const TARGET_WIDTH = 384; // Lebar pas RPP02N (58mm)
      const scale = TARGET_WIDTH / sourceCanvas.width;
      const targetHeight = Math.round(sourceCanvas.height * scale);

      // Buat canvas penyesuaian resolusi
      const printCanvas = document.createElement('canvas');
      printCanvas.width = TARGET_WIDTH;
      printCanvas.height = targetHeight;
      const pCtx = printCanvas.getContext('2d');

      pCtx.fillStyle = '#FFFFFF';
      pCtx.fillRect(0, 0, TARGET_WIDTH, targetHeight);
      pCtx.drawImage(sourceCanvas, 0, 0, TARGET_WIDTH, targetHeight);

      const imgData = pCtx.getImageData(0, 0, TARGET_WIDTH, targetHeight).data;

      // Koneksi Web Bluetooth
      const device = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: ['000018f0-0000-1000-8000-00805f9b34fb', '49535343-fe7d-4ae5-8fa9-9fafd205e455']
      });

      const server = await device.gatt.connect();
      const service = await server.getPrimaryService('000018f0-0000-1000-8000-00805f9b34fb');
      const characteristic = await service.getCharacteristic('00002af1-0000-1000-8000-00805f9b34fb');

      // Reset printer
      await characteristic.writeValue(new Uint8Array([0x1B, 0x40]));

      // KIRIM PER BARIS / BLOK KECIL (VERTICAL CHUNKING) AGAR TIDAK OVERFLOW
      const bytesPerLine = TARGET_WIDTH / 8; // 48 bytes
      const blockHeight = 24; // Cetak per 24 baris piksel sekali kirim

      for (let y = 0; y < targetHeight; y += blockHeight) {
        let blockData = [];
        let currentBlockHeight = Math.min(blockHeight, targetHeight - y);

        // Header ESC/POS Raster untuk blok ini
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
              
              // Ubah ke grayscale & threshold hitam-putih tajam untuk barcode/logo
              let avg = (r + g + b) / 3;
              if (avg < 140) { // Threshold kontras tinggi agar barcode J&T & logo Blibli tidak pecah
                byte |= (0x80 >> bit);
              }
            }
            blockData.push(byte);
          }
        }

        // Kirim blok dengan aman via Bluetooth dengan jeda kecil
        const chunkSize = 128;
        for (let i = 0; i < blockData.length; i += chunkSize) {
          const chunk = new Uint8Array(blockData.slice(i, i + chunkSize));
          await characteristic.writeValue(chunk);
        }
        await new Promise(r => setTimeout(r, 25)); // Jeda agar buffer printer bernapas
      }

      // Feed kertas di akhir
      await characteristic.writeValue(new Uint8Array([0x1B, 0x64, 0x04]));
      alert('Label resi berhasil dicetak utuh sebagai gambar!');
    } catch (err) {
      alert(`Gagal mencetak resi: ${err.message}`);
    } finally {
      setIsPrinting(false);
    }
  };

  // 1. CETAK TEKS BEBAS LANGSUNG (DIRECT ESC/POS)
  const handlePrintFreeText = () => {
    if (!freeText.trim()) {
      alert('Ketik teks terlebih dahulu!');
      return;
    }

    let bytes = [0x1B, 0x40]; // Reset printer

    // Setting ukuran font ESC/POS
    if (textSize === 'large') {
      bytes.push(0x1D, 0x21, 0x11); // Double height & width
    } else if (textSize === 'xlarge') {
      bytes.push(0x1D, 0x21, 0x22); // Triple size
    } else {
      bytes.push(0x1D, 0x21, 0x00); // Normal
    }

    // Encoder Teks
    const encoder = new TextEncoder();
    const textBytes = Array.from(encoder.encode(freeText + '\n\n\n\n'));
    bytes = bytes.concat(textBytes);

    sendDirectEscPosText(bytes);
  };

  // 2. CETAK ALAMAT LANGSUNG (DIRECT ESC/POS)
  const handlePrintAddress = () => {
    let bytes = [0x1B, 0x40]; // Reset
    const encoder = new TextEncoder();

    const addText = (str, isBold = false, align = 0, size = 0x00) => {
      bytes.push(0x1B, 0x61, align); // 0: Left, 1: Center
      bytes.push(0x1B, 0x45, isBold ? 1 : 0); // Bold
      bytes.push(0x1D, 0x21, size); // Size
      const encoded = Array.from(encoder.encode(str + '\n'));
      bytes = bytes.concat(encoded);
    };

    // Header Kurir & Booking
    addText(`KURIR: ${addressData.jasaKurir}`, true, 0, 0x11);
    addText(`BOOKING: ${addressData.kodeBooking}`, true, 0, 0x10);
    addText('--------------------------------', false, 0, 0x00);

    // Penerima
    addText('PENERIMA:', true, 0, 0x00);
    addressData.penerima.split('\n').forEach(line => addText(line, false, 0, 0x00));
    addText('--------------------------------', false, 0, 0x00);

    // Pengirim
    addText('PENGIRIM:', true, 0, 0x00);
    addressData.pengirim.split('\n').forEach(line => addText(line, false, 0, 0x00));
    addText('--------------------------------', false, 0, 0x00);

    // Barcode Code128 bawaan printer
    if (addressData.kodeBooking) {
      addText('KODE BOOKING BARCODE:', false, 1, 0x00);
      bytes.push(0x1D, 0x6B, 0x49); // GS k 73 (Code128)
      const codeBytes = Array.from(encoder.encode(addressData.kodeBooking));
      bytes.push(codeBytes.length);
      bytes = bytes.concat(codeBytes);
      bytes.push(0x0A);
    }

    // Feed kertas
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
          {activeTab === 'image' && <><ImageIcon size={20} /> Upload Gambar</>}
          {activeTab === 'pdf' && <><FileText size={20} /> Upload PDF</>}
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

            {/* TOMBOL CETAK LANGSUNG TEKS */}
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

            {/* TOMBOL CETAK LANGSUNG ALAMAT */}
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

        {/* TAB 3 & 4: IMAGE & PDF */}
        {(activeTab === 'image' || activeTab === 'pdf') && (
          <div className="flex flex-col items-center justify-center p-8 border-2 border-dashed border-gray-300 rounded-lg bg-white space-y-3">
            <Upload size={40} className="text-gray-400" />
            <p className="text-sm text-gray-600 font-medium">
              Upload file {activeTab === 'image' ? 'Gambar (JPG/PNG)' : 'Dokumen PDF'}
            </p>
            <input 
              type="file" 
              accept={activeTab === 'image' ? 'image/*' : 'application/pdf'} 
              className="text-xs text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-teal-50 file:text-teal-800 hover:file:bg-teal-100"
            />
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

      {/* BOTTOM NAVIGATION (HANYA 4 TAB) */}
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