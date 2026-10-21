import React, { useState, useEffect, useRef } from 'react';
import { 
  Type, 
  MapPin, 
  Image as ImageIcon, 
  FileText, 
  Printer, 
  Settings, 
  RotateCw, 
  Sun, 
  Moon, 
  Save, 
  Trash2, 
  Upload, 
  CheckSquare, 
  RefreshCw,
  ScanLine,
  Bluetooth,
  Wifi,
  Usb,
  Search,
  CheckCircle2,
  XCircle,
  Loader2
} from 'lucide-react';
import bwipjs from 'bwip-js';
import jsQR from 'jsqr';
import * as pdfjsLib from 'pdfjs-dist';

// Konfigurasi Worker PDF.js via CDN
pdfjsLib.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

export default function App() {
  const [activeTab, setActiveTab] = useState('text');
  
  // STATE SETTING PRINTER
  const [printerSettings, setPrinterSettings] = useState(() => {
    const saved = localStorage.getItem('thermal_printer_settings');
    return saved ? JSON.parse(saved) : {
      connectionType: 'bluetooth',
      printerName: 'Belum Terhubung',
      printerId: null,
      paperSize: '80mm',
      customWidthMm: 0,
      autoCut: false
    };
  });

  const [isScanningBluetooth, setIsScanningBluetooth] = useState(false);
  const [bluetoothStatus, setBluetoothStatus] = useState('disconnected');
  const [showDeviceModal, setShowDeviceModal] = useState(false);
  const [bluetoothError, setBluetoothError] = useState(null);

  // STATE TEKS & ALAMAT
  const [freeText, setFreeText] = useState('');
  const [textSize, setTextSize] = useState(20);
  const [savedTexts, setSavedTexts] = useState([]);

  const [addressData, setAddressData] = useState({
    penerima: 'Andi Teile\nJl. Raya Saketi Km.07 Kp.Pagenggang Babakan Rt.020/002\nKab. Lebak, Banten, 42391',
    pengirim: 'Toko Berkah Utama\nJl. Merdeka No. 45 Tangerang',
    jasaKurir: 'J&T EXPRESS',
    kodeBooking: 'JJ2000129454',
    isiPaket: 'Celana Chino Pria Cardinal Original Slim Fit 29 SILVER',
    catatan: 'Jangan dibanting, barang pecah belah',
  });

  // STATE GAMBAR & PDF
  const [uploadedImageSrc, setUploadedImageSrc] = useState(null);
  const [pdfCanvasImage, setPdfCanvasImage] = useState(null);
  const [isLoadingPdf, setIsLoadingPdf] = useState(false);
  const [detectedBarcodeText, setDetectedBarcodeText] = useState(null);
  const [showDetectedBarcode, setShowDetectedBarcode] = useState(true);

  // STATE PREVIEW & FILTER
  const [blackSlider, setBlackSlider] = useState(50);
  const [whiteSlider, setWhiteSlider] = useState(50);
  const [rotationAngle, setRotationAngle] = useState(0);
  const [printCopies, setPrintCopies] = useState(1);

  const mainCanvasRef = useRef(null);
  const barcodeCanvasRef = useRef(null);

  useEffect(() => {
    localStorage.setItem('thermal_printer_settings', JSON.stringify(printerSettings));
  }, [printerSettings]);

  useEffect(() => {
    const saved = localStorage.getItem('thermal_saved_texts');
    if (saved) {
      try { setSavedTexts(JSON.parse(saved)); } catch (e) {}
    }
  }, []);

  // FITUR SCAN BLUETOOTH BROWSER
  const handleScanBluetooth = async () => {
    setBluetoothError(null);
    setIsScanningBluetooth(true);

    if (!navigator.bluetooth) {
      setBluetoothError('Web Bluetooth API tidak didukung di browser ini. Pastikan memakai Chrome Android/PC.');
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
        const updatedSettings = {
          ...printerSettings,
          printerName: device.name || `Printer (${device.id.slice(0, 8)})`,
          printerId: device.id
        };
        setPrinterSettings(updatedSettings);
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

  // UPLOAD FILE GAMBAR & ESTRAKSI BARCODE
  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.type === 'application/pdf') {
      handlePdfUpload(file);
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const imgSrc = event.target.result;
      setUploadedImageSrc(imgSrc);
      setPdfCanvasImage(null);
      setActiveTab('preview');

      const img = new Image();
      img.src = imgSrc;
      img.onload = () => {
        const tempCanvas = document.createElement('canvas');
        const tempCtx = tempCanvas.getContext('2d');
        tempCanvas.width = img.width;
        tempCanvas.height = img.height;
        tempCtx.drawImage(img, 0, 0);
        
        const imgData = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
        const code = jsQR(imgData.data, imgData.width, imgData.height);
        
        if (code) {
          setDetectedBarcodeText(code.data);
          setShowDetectedBarcode(true);
        } else {
          setDetectedBarcodeText(null);
          setShowDetectedBarcode(false);
        }
      };
    };
    reader.readAsDataURL(file);
  };

  // RENDERING PDF DENGAN PDF.JS
  const handlePdfUpload = async (file) => {
    setIsLoadingPdf(true);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      const page = await pdf.getPage(1); // Render halaman pertama

      const viewport = page.getViewport({ scale: 2.0 });
      const tempCanvas = document.createElement('canvas');
      const tempCtx = tempCanvas.getContext('2d');
      tempCanvas.width = viewport.width;
      tempCanvas.height = viewport.height;

      await page.render({ canvasContext: tempCtx, viewport }).promise;

      const pdfImgDataUrl = tempCanvas.toDataURL('image/png');
      setPdfCanvasImage(pdfImgDataUrl);
      setUploadedImageSrc(null);
      setActiveTab('preview');

      // Deteksi Barcode dari PDF
      const imgData = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
      const code = jsQR(imgData.data, imgData.width, imgData.height);
      if (code) {
        setDetectedBarcodeText(code.data);
        setShowDetectedBarcode(true);
      } else {
        setDetectedBarcodeText(null);
        setShowDetectedBarcode(false);
      }
    } catch (err) {
      alert('Gagal membaca PDF: ' + err.message);
    } finally {
      setIsLoadingPdf(false);
    }
  };

  // BARCODE GENERATOR
  useEffect(() => {
    const activeCode = (uploadedImageSrc || pdfCanvasImage) ? detectedBarcodeText : addressData.kodeBooking;
    if (showDetectedBarcode && barcodeCanvasRef.current && activeCode) {
      try {
        bwipjs.toCanvas(barcodeCanvasRef.current, {
          bcid: 'code128',
          text: activeCode,
          scale: 3,
          height: 12,
          includetext: false,
        });
      } catch (e) {}
    }
  }, [showDetectedBarcode, detectedBarcodeText, addressData.kodeBooking, uploadedImageSrc, pdfCanvasImage, activeTab]);

  // RENDER CANVAS PREVIEW CETAK
  useEffect(() => {
    if (activeTab === 'preview' && mainCanvasRef.current) {
      const canvas = mainCanvasRef.current;
      const ctx = canvas.getContext('2d');
      
      let width = 384; 
      if (printerSettings.paperSize === '80mm') width = 576;
      if (printerSettings.paperSize === '100mm') width = 800;
      if (printerSettings.customWidthMm > 0) width = Math.round(printerSettings.customWidthMm * 8);

      canvas.width = width;
      
      const activeSrc = uploadedImageSrc || pdfCanvasImage;

      if (activeSrc) {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.src = activeSrc;
        img.onload = () => {
          const aspectRatio = img.height / img.width;
          canvas.height = width * aspectRatio;

          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          applyThermalFilter(ctx, canvas.width, canvas.height);
        };
      } else {
        canvas.height = Math.round(width * 1.3);
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.fillStyle = '#000000';
        ctx.font = 'bold 18px Arial';
        
        let y = 35;
        ctx.fillText(`KURIR: ${addressData.jasaKurir}`, 20, y); y += 25;
        ctx.fillText(`BOOKING: ${addressData.kodeBooking}`, 20, y); y += 35;

        ctx.font = '14px Arial';
        ctx.fillText(`PENERIMA:`, 20, y); y += 20;
        addressData.penerima.split('\n').forEach(line => {
          ctx.fillText(line, 30, y); y += 18;
        });

        y += 10;
        ctx.fillText(`PENGIRIM:`, 20, y); y += 20;
        addressData.pengirim.split('\n').forEach(line => {
          ctx.fillText(line, 30, y); y += 18;
        });

        y += 15;
        ctx.fillText(`ISI PAKET: ${addressData.isiPaket}`, 20, y); y += 20;
        ctx.fillText(`CATATAN: ${addressData.catatan}`, 20, y);

        if (freeText) {
          y += 35;
          ctx.font = `${textSize}px Arial`;
          ctx.fillText(freeText, 20, y);
        }

        applyThermalFilter(ctx, canvas.width, canvas.height);
      }
    }
  }, [activeTab, blackSlider, whiteSlider, printerSettings, addressData, freeText, textSize, uploadedImageSrc, pdfCanvasImage]);

  const applyThermalFilter = (ctx, width, height) => {
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;
    const baseThreshold = 128;
    const blackAdjustment = (blackSlider - 50) * 1.8;
    const whiteAdjustment = (whiteSlider - 50) * 1.8;
    const finalThreshold = Math.min(250, Math.max(5, baseThreshold + whiteAdjustment - blackAdjustment));

    for (let i = 0; i < data.length; i += 4) {
      const grayscale = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      const binaryColor = grayscale < finalThreshold ? 0 : 255;
      data[i] = binaryColor;
      data[i + 1] = binaryColor;
      data[i + 2] = binaryColor;
    }
    ctx.putImageData(imageData, 0, 0);
  };

  const handleResetFilter = () => {
    setBlackSlider(50);
    setWhiteSlider(50);
    setRotationAngle(0);
  };

  // FUNGSI CETAK GAMBAR / RESI KE PRINTER THERMAL VIA BLUETOOTH
  // FUNGSI CETAK MURNI WEB BLUETOOTH (ESC/POS BIT-IMAGE UNTUK RPP02N)
  // FUNGSI CETAK PRESISI RPP02N (FIX 384 DOTS / 48 BYTES PER BARIS)
  const handlePrint = async () => {
    if (!mainCanvasRef.current) return;

    try {
      const sourceCanvas = mainCanvasRef.current;
      
      // 1. Buat Offscreen Canvas khusus berukuran tepat 384 piksel (Lebar Fisik RPP02N)
      const TARGET_WIDTH = 384;
      const scaleFactor = TARGET_WIDTH / sourceCanvas.width;
      const targetHeight = Math.round(sourceCanvas.height * scaleFactor);

      const printCanvas = document.createElement('canvas');
      printCanvas.width = TARGET_WIDTH;
      printCanvas.height = targetHeight;
      const pCtx = printCanvas.getContext('2d');

      // Gambar ulang dari canvas utama ke canvas 384px
      pCtx.fillStyle = '#FFFFFF';
      pCtx.fillRect(0, 0, TARGET_WIDTH, targetHeight);
      pCtx.drawImage(sourceCanvas, 0, 0, TARGET_WIDTH, targetHeight);

      // Ambil piksel yang sudah pas 384px
      const imgData = pCtx.getImageData(0, 0, TARGET_WIDTH, targetHeight).data;

      // 2. Minta Akses Web Bluetooth HP
      const device = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: ['000018f0-0000-1000-8000-00805f9b34fb', '49535343-fe7d-4ae5-8fa9-9fafd205e455']
      });

      const server = await device.gatt.connect();
      const service = await server.getPrimaryService('000018f0-0000-1000-8000-00805f9b34fb');
      const characteristic = await service.getCharacteristic('00002af1-0000-1000-8000-00805f9b34fb');

      // 3. Konversi Piksel ke Perintah Raster ESC/POS (GS v 0)
      const bytesPerLine = TARGET_WIDTH / 8; // Tepat 48 Byte!
      let command = [];

      // Reset printer ESC @
      command.push(0x1B, 0x40);

      // Perintah GS v 0 (Raster Mode)
      command.push(0x1D, 0x76, 0x30, 0x00);
      command.push(bytesPerLine & 0xFF, (bytesPerLine >> 8) & 0xFF); // xL, xH = 48, 0
      command.push(targetHeight & 0xFF, (targetHeight >> 8) & 0xFF); // yL, yH

      for (let y = 0; y < targetHeight; y++) {
        for (let x = 0; x < bytesPerLine; x++) {
          let byte = 0;
          for (let bit = 0; bit < 8; bit++) {
            const pixelX = x * 8 + bit;
            const idx = (y * TARGET_WIDTH + pixelX) * 4;
            const r = imgData[idx];
            
            // Jika warna piksel hitam (di bawah threshold)
            if (r < 128) {
              byte |= (0x80 >> bit);
            }
          }
          command.push(byte);
        }
      }

      // Spasi Kertas Akhir (Feed 4 baris)
      command.push(0x1B, 0x64, 0x04);

      // 4. Kirim Data dengan Chunking 128 Byte & Delay 15ms (Penting untuk RPP02N!)
      const chunkSize = 128;
      for (let i = 0; i < command.length; i += chunkSize) {
        const chunk = new Uint8Array(command.slice(i, i + chunkSize));
        await characteristic.writeValue(chunk);
        await new Promise(resolve => setTimeout(resolve, 15));
      }

      alert('Berhasil! Gambar/PDF resi tercetak rapi.');
    } catch (err) {
      alert(`Gagal mencetak: ${err.message}`);
    }
  };

  const activeDisplayCode = (uploadedImageSrc || pdfCanvasImage) ? detectedBarcodeText : addressData.kodeBooking;

  return (
    <div className="flex flex-col h-screen bg-gray-100 font-sans max-w-md mx-auto shadow-lg overflow-hidden relative">
      
      {/* HEADER */}
      <div className="bg-teal-800 text-white p-3 flex items-center justify-between shadow-md">
        <h1 className="font-semibold text-lg capitalize flex items-center gap-2">
          {activeTab === 'text' && <><Type size={20} /> Text Bebas</>}
          {activeTab === 'alamat' && <><MapPin size={20} /> Alamat Pengiriman</>}
          {activeTab === 'image' && <><ImageIcon size={20} /> Print Image</>}
          {activeTab === 'pdf' && <><FileText size={20} /> Print PDF</>}
          {activeTab === 'settings' && <><Settings size={20} /> Pengaturan Printer</>}
          {activeTab === 'preview' && <><Printer size={20} /> Preview Cetak</>}
        </h1>
        {activeTab !== 'settings' && (
          <button onClick={() => setActiveTab('settings')} className="p-1 hover:bg-teal-700 rounded transition">
            <Settings size={22} />
          </button>
        )}
      </div>

      {/* BODY CONTENT */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        
        {/* TAB TEXT */}
        {activeTab === 'text' && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 bg-white p-3 rounded-lg border">
              <label className="text-xs font-semibold text-gray-600">Ukuran: {textSize}</label>
              <input 
                type="range" min="10" max="60" value={textSize} 
                onChange={(e) => setTextSize(Number(e.target.value))}
                className="flex-1 accent-teal-800"
              />
            </div>
            <textarea
              value={freeText}
              onChange={(e) => setFreeText(e.target.value)}
              placeholder="Tulis teks bebas di sini..."
              rows={8}
              className="w-full p-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-800 text-gray-800 bg-white"
            />
            <button 
              onClick={() => {
                if (!freeText.trim()) return;
                const newSaved = [...savedTexts, { id: Date.now(), text: freeText, size: textSize }];
                setSavedTexts(newSaved);
                localStorage.setItem('thermal_saved_texts', JSON.stringify(newSaved));
                alert('Teks berhasil disimpan!');
              }}
              className="w-full bg-teal-800 text-white py-2 rounded-lg flex items-center justify-center gap-2 text-sm font-medium hover:bg-teal-900"
            >
              <Save size={16} /> Simpan Teks
            </button>
          </div>
        )}

        {/* TAB ALAMAT */}
        {activeTab === 'alamat' && (
          <div className="space-y-3">
            <div>
              <label className="text-xs font-semibold text-gray-600">Penerima</label>
              <textarea value={addressData.penerima} onChange={(e) => setAddressData({...addressData, penerima: e.target.value})} rows={2} className="w-full p-2 border rounded bg-white text-sm" />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600">Pengirim</label>
              <textarea value={addressData.pengirim} onChange={(e) => setAddressData({...addressData, pengirim: e.target.value})} rows={2} className="w-full p-2 border rounded bg-white text-sm" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-semibold text-gray-600">Jasa Kurir</label>
                <input type="text" value={addressData.jasaKurir} onChange={(e) => setAddressData({...addressData, jasaKurir: e.target.value})} className="w-full p-2 border rounded bg-white text-sm" />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600">Kode Booking</label>
                <input type="text" value={addressData.kodeBooking} onChange={(e) => setAddressData({...addressData, kodeBooking: e.target.value})} className="w-full p-2 border rounded bg-white text-sm" />
              </div>
            </div>
          </div>
        )}

        {/* TAB IMAGE & PDF */}
        {(activeTab === 'image' || activeTab === 'pdf') && (
          <div className="flex flex-col items-center justify-center p-8 border-2 border-dashed border-gray-300 rounded-lg bg-white space-y-3">
            {isLoadingPdf ? (
              <div className="flex flex-col items-center space-y-2">
                <Loader2 size={32} className="animate-spin text-teal-800" />
                <p className="text-xs font-medium text-gray-600">Memproses PDF...</p>
              </div>
            ) : (
              <>
                <Upload size={40} className="text-gray-400" />
                <p className="text-sm text-gray-600 font-medium">
                  Upload file {activeTab === 'image' ? 'Gambar (JPG/PNG)' : 'Dokumen PDF'}
                </p>
                <input 
                  type="file" 
                  accept={activeTab === 'image' ? 'image/*' : 'application/pdf'} 
                  onChange={handleImageUpload}
                  className="text-xs text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-teal-50 file:text-teal-800 hover:file:bg-teal-100"
                />
              </>
            )}
          </div>
        )}

        {/* TAB SETTINGS */}
        {activeTab === 'settings' && (
          <div className="bg-white p-4 rounded-lg border space-y-4 shadow-sm">
            <div>
              <label className="text-xs font-bold text-gray-600 block mb-2">Koneksi Printer</label>
              <div className="flex gap-4 text-sm">
                <label className="flex items-center gap-1.5 cursor-pointer font-medium">
                  <input type="radio" name="conn" checked={printerSettings.connectionType === 'bluetooth'} onChange={() => setPrinterSettings({...printerSettings, connectionType: 'bluetooth'})} className="accent-teal-800" /> 
                  <Bluetooth size={16} className="text-blue-600" /> Bluetooth
                </label>
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-gray-600 block mb-1">Printer Tersambung</label>
              <div className="flex gap-2">
                <div 
                  onClick={() => setShowDeviceModal(true)}
                  className="flex-1 p-2.5 border rounded-lg text-sm bg-gray-50 flex items-center justify-between cursor-pointer hover:bg-gray-100"
                >
                  <span className={`font-mono font-bold ${printerSettings.printerName === 'Belum Terhubung' ? 'text-gray-400' : 'text-teal-800'}`}>
                    {printerSettings.printerName}
                  </span>
                  {bluetoothStatus === 'connected' ? (
                    <span className="flex items-center gap-1 text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                      <CheckCircle2 size={12} /> Terhubung
                    </span>
                  ) : (
                    <span className="text-xs text-teal-800 underline font-medium">Pilih/Cari</span>
                  )}
                </div>
                <button onClick={handleScanBluetooth} disabled={isScanningBluetooth} className="bg-teal-800 text-white px-3 py-2 rounded-lg text-xs font-medium flex items-center gap-1 hover:bg-teal-900">
                  {isScanningBluetooth ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
                  <span>Scan</span>
                </button>
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-gray-600 block mb-2">Ukuran Kertas</label>
              <div className="flex gap-4 text-sm">
                {['58mm', '80mm', '100mm'].map((size) => (
                  <label key={size} className="flex items-center gap-1.5 cursor-pointer font-medium">
                    <input type="radio" name="paper" checked={printerSettings.paperSize === size} onChange={() => setPrinterSettings({...printerSettings, paperSize: size})} className="accent-teal-800" /> {size}
                  </label>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* TAB PREVIEW CETAK */}
        {activeTab === 'preview' && (
          <div className="space-y-4">
            {activeDisplayCode ? (
              <div className="bg-white p-3 rounded-lg border space-y-2 shadow-sm border-teal-200">
                <label className="flex items-center gap-2 text-xs font-bold text-teal-800 cursor-pointer">
                  <input type="checkbox" checked={showDetectedBarcode} onChange={(e) => setShowDetectedBarcode(e.target.checked)} className="w-4 h-4 accent-teal-800" />
                  <span className="flex items-center gap-1"><ScanLine size={14}/> Barcode Terdeteksi: {activeDisplayCode}</span>
                </label>
                {showDetectedBarcode && (
                  <div className="flex justify-center p-2 bg-white rounded border">
                    <canvas ref={barcodeCanvasRef} className="max-w-full" />
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-amber-50 border border-amber-200 p-2.5 rounded-lg text-xs text-amber-800 flex items-center gap-2">
                <ScanLine size={16} /> Tidak ada barcode terdeteksi pada file ini. Kotak barcode disembunyikan.
              </div>
            )}

            <div className="relative border-2 border-red-500 p-2 bg-white rounded-lg flex justify-center items-center overflow-hidden">
              <canvas 
                ref={mainCanvasRef} 
                className="max-w-full h-auto shadow-sm"
                style={{ transform: `rotate(${rotationAngle}deg)` }}
              />
            </div>

            <div className="bg-white p-3 rounded-lg border space-y-3">
              <div className="flex items-center justify-between text-xs font-semibold text-gray-600">
                <label className="flex items-center gap-1"><CheckSquare size={14} /> Auto Fit</label>
                <button onClick={handleResetFilter} className="flex items-center gap-1 text-teal-800 hover:underline">
                  <RefreshCw size={12} /> Reset Filter
                </button>
              </div>

              <div className="flex items-center gap-3">
                <Moon size={18} className="text-gray-700" />
                <input type="range" min="0" max="100" value={blackSlider} onChange={(e) => setBlackSlider(Number(e.target.value))} className="flex-1 accent-teal-800" />
              </div>

              <div className="flex items-center gap-3">
                <Sun size={18} className="text-yellow-600" />
                <input type="range" min="0" max="100" value={whiteSlider} onChange={(e) => setWhiteSlider(Number(e.target.value))} className="flex-1 accent-teal-800" />
              </div>
            </div>
          </div>
        )}

      </div>

      {/* MODAL SEARCH BLUETOOTH */}
      {showDeviceModal && (
        <div className="absolute inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl w-full max-w-xs p-4 space-y-3 shadow-xl">
            <div className="flex justify-between items-center border-b pb-2">
              <h3 className="font-bold text-sm text-gray-800 flex items-center gap-1.5">
                <Bluetooth size={18} className="text-blue-600" /> Sambung Bluetooth
              </h3>
              <button onClick={() => setShowDeviceModal(false)} className="text-gray-400 hover:text-gray-600"><XCircle size={18} /></button>
            </div>

            {bluetoothError && <div className="text-xs bg-red-50 text-red-600 p-2 rounded border border-red-200">{bluetoothError}</div>}

            <p className="text-xs text-gray-600">Pastikan Bluetooth HP/Laptop sudah menyala dan printer berada dalam mode pairing.</p>

            <button onClick={handleScanBluetooth} disabled={isScanningBluetooth} className="w-full bg-teal-800 text-white py-2.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 hover:bg-teal-900">
              {isScanningBluetooth ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
              {isScanningBluetooth ? 'Memindai...' : 'Pindai Bluetooth Browser'}
            </button>

            <button onClick={() => setShowDeviceModal(false)} className="w-full bg-gray-100 text-gray-700 py-2 rounded-lg text-xs font-semibold hover:bg-gray-200">
              Tutup
            </button>
          </div>
        </div>
      )}

      {/* FOOTER ACTIONS */}
      {activeTab === 'preview' && (
        <div className="bg-white border-t p-2 flex items-center justify-around">
          <button onClick={() => setActiveTab('settings')} className="p-2 text-gray-600 hover:bg-gray-100 rounded"><Settings size={20} /></button>
          <button onClick={() => setRotationAngle((prev) => (prev + 90) % 360)} className="p-2 text-gray-600 hover:bg-gray-100 rounded"><RotateCw size={20} /></button>
          <button onClick={handlePrint} className="bg-teal-800 text-white px-4 py-2 rounded-lg font-medium text-sm flex items-center gap-2 hover:bg-teal-900">
            <Printer size={18} /> Print
          </button>
          <div className="flex items-center gap-1 text-sm font-semibold text-gray-700">
            <span>×</span>
            <input type="number" value={printCopies} onChange={(e) => setPrintCopies(Math.max(1, Number(e.target.value)))} className="w-10 p-1 border rounded text-center text-xs" />
          </div>
        </div>
      )}

      {/* BOTTOM NAVIGATION */}
      <div className="bg-teal-800 text-white flex justify-around items-center p-2 relative">
        <button onClick={() => setActiveTab('text')} className={`flex flex-col items-center text-xs ${activeTab === 'text' ? 'text-yellow-400 font-bold' : 'text-gray-300'}`}><Type size={18} /> Text</button>
        <button onClick={() => setActiveTab('alamat')} className={`flex flex-col items-center text-xs ${activeTab === 'alamat' ? 'text-yellow-400 font-bold' : 'text-gray-300'}`}><MapPin size={18} /> Alamat</button>
        <button onClick={() => setActiveTab('preview')} className="bg-teal-600 p-3 rounded-full border-4 border-gray-100 -mt-6 shadow-lg text-white hover:bg-teal-500 transition"><Printer size={24} /></button>
        <button onClick={() => setActiveTab('image')} className={`flex flex-col items-center text-xs ${activeTab === 'image' ? 'text-yellow-400 font-bold' : 'text-gray-300'}`}><ImageIcon size={18} /> Image</button>
        <button onClick={() => setActiveTab('pdf')} className={`flex flex-col items-center text-xs ${activeTab === 'pdf' ? 'text-yellow-400 font-bold' : 'text-gray-300'}`}><FileText size={18} /> Pdf</button>
      </div>

    </div>
  );
}