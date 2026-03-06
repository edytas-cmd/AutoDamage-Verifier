import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Car, 
  Upload, 
  AlertCircle, 
  CheckCircle2, 
  XCircle, 
  Loader2, 
  Camera, 
  FileText,
  ChevronRight,
  Image as ImageIcon,
  Trash2,
  Download,
  AlertTriangle
} from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { analyzeVehicleDamage, extractTextFromImage, type DamageAnalysis, type UnrelatedDamage } from './services/geminiService';
import Markdown from 'react-markdown';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

const DamageOverlay = ({ image, damages }: { image: string, damages: UnrelatedDamage[] }) => {
  return (
    <div className="relative rounded-2xl overflow-hidden border border-slate-200 shadow-sm">
      <img src={image} alt="Analiza uszkodzeń" className="w-full h-auto block" referrerPolicy="no-referrer" />
      <svg 
        className="absolute inset-0 w-full h-full pointer-events-none" 
        viewBox="0 0 1000 1000" 
        preserveAspectRatio="none"
      >
        {damages.map((d, i) => {
          if (!d.boundingBox) return null;
          const [ymin, xmin, ymax, xmax] = d.boundingBox;
          return (
            <g key={i}>
              <rect
                x={xmin}
                y={ymin}
                width={xmax - xmin}
                height={ymax - ymin}
                fill="none"
                stroke="#f43f5e"
                strokeWidth="6"
                className="animate-pulse"
              />
              <rect
                x={xmin}
                y={ymin - 45 > 0 ? ymin - 45 : ymin}
                width="180"
                height="40"
                fill="#f43f5e"
                className="opacity-90"
              />
              <text
                x={xmin + 10}
                y={ymin - 45 > 0 ? ymin - 15 : ymin + 25}
                fill="white"
                fontSize="28"
                fontWeight="bold"
                className="select-none"
              >
                {d.type === 'pre_existing' ? 'STARE' : 'BEZ ZWIĄZKU'}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
};

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export default function App() {
  const [victimImages, setVictimImages] = useState<string[]>([]);
  const [perpetratorImages, setPerpetratorImages] = useState<string[]>([]);
  const [description, setDescription] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isOcrLoading, setIsOcrLoading] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [result, setResult] = useState<DamageAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const victimFileInputRef = useRef<HTMLInputElement>(null);
  const perpetratorFileInputRef = useRef<HTMLInputElement>(null);
  const ocrInputRef = useRef<HTMLInputElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>, type: 'victim' | 'perpetrator') => {
    const files = Array.from(e.target.files || []);
    files.forEach(file => {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (type === 'victim') {
          setVictimImages(prev => [...prev, reader.result as string]);
        } else {
          setPerpetratorImages(prev => [...prev, reader.result as string]);
        }
      };
      reader.readAsDataURL(file);
    });
  };

  const handleOcrUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsOcrLoading(true);
    setError(null);

    const reader = new FileReader();
    reader.onloadend = async () => {
      try {
        const text = await extractTextFromImage(reader.result as string, file.type);
        if (text) {
          setDescription(prev => prev ? `${prev}\n\n${text}` : text);
        } else {
          setError('Nie udało się odczytać tekstu z pliku.');
        }
      } catch (err) {
        console.error(err);
        setError('Błąd podczas odczytywania tekstu (OCR).');
      } finally {
        setIsOcrLoading(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const removeImage = (index: number, type: 'victim' | 'perpetrator') => {
    if (type === 'victim') {
      setVictimImages(prev => prev.filter((_, i) => i !== index));
    } else {
      setPerpetratorImages(prev => prev.filter((_, i) => i !== index));
    }
  };

  const handleVerify = async () => {
    if (victimImages.length === 0) {
      setError('Proszę dodać przynajmniej jedno zdjęcie pojazdu poszkodowanego.');
      return;
    }
    if (!description.trim()) {
      setError('Proszę opisać przebieg zdarzenia.');
      return;
    }

    setIsAnalyzing(true);
    setError(null);
    setResult(null);

    try {
      const analysis = await analyzeVehicleDamage(victimImages, perpetratorImages, description);
      setResult(analysis);
    } catch (err) {
      console.error(err);
      setError('Wystąpił błąd podczas analizy. Spróbuj ponownie.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleExportPdf = async () => {
    if (!resultRef.current || !result) return;
    
    setIsExporting(true);
    try {
      const canvas = await html2canvas(resultRef.current, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff',
        onclone: (clonedDoc) => {
          const elements = clonedDoc.getElementsByTagName('*');
          for (let i = 0; i < elements.length; i++) {
            const el = elements[i] as HTMLElement;
            
            // Force Black & White for PDF export
            el.style.color = '#000000';
            el.style.fill = '#000000';
            el.style.stroke = '#000000';
            
            // Handle backgrounds - keep them white or transparent
            const style = window.getComputedStyle(el);
            if (style.backgroundColor !== 'rgba(0, 0, 0, 0)' && style.backgroundColor !== 'transparent') {
              el.style.backgroundColor = '#ffffff';
            }
            
            // Force borders to be visible in B&W
            if (style.borderWidth !== '0px') {
              el.style.borderColor = '#000000';
            }
            
            // Remove any shadows for cleaner B&W print
            el.style.boxShadow = 'none';
            el.style.textShadow = 'none';
          }
        }
      });
      
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      });
      
      const imgProps = pdf.getImageProperties(imgData);
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
      
      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
      pdf.save(`Weryfikacja_Szkody_${new Date().getTime()}.pdf`);
    } catch (err) {
      console.error('Błąd eksportu PDF:', err);
      setError('Nie udało się wyeksportować pliku PDF.');
    } finally {
      setIsExporting(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Consistent': return { 
        className: 'text-emerald-600 bg-emerald-50 border-emerald-100',
        style: { color: '#059669', backgroundColor: '#ecfdf5', borderColor: '#d1fae5' }
      };
      case 'Partially Consistent': return { 
        className: 'text-amber-600 bg-amber-50 border-amber-100',
        style: { color: '#d97706', backgroundColor: '#fffbeb', borderColor: '#fef3c7' }
      };
      case 'Inconsistent': return { 
        className: 'text-rose-600 bg-rose-50 border-rose-100',
        style: { color: '#e11d48', backgroundColor: '#fff1f2', borderColor: '#ffe4e6' }
      };
      default: return { 
        className: 'text-slate-600 bg-slate-50 border-slate-100',
        style: { color: '#475569', backgroundColor: '#f8fafc', borderColor: '#f1f5f9' }
      };
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'Consistent': return <CheckCircle2 className="w-5 h-5" />;
      case 'Partially Consistent': return <AlertCircle className="w-5 h-5" />;
      case 'Inconsistent': return <XCircle className="w-5 h-5" />;
      default: return null;
    }
  };

  const translateStatus = (status: string) => {
    switch (status) {
      case 'Consistent': return 'Zgodne';
      case 'Partially Consistent': return 'Częściowo zgodne';
      case 'Inconsistent': return 'Niezgodne';
      default: return status;
    }
  };

  return (
    <div className="min-h-screen bg-[#F8F9FA] text-slate-900 font-sans selection:bg-indigo-100">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-indigo-200">
              <Car className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-lg font-semibold tracking-tight">AutoDamage Verifier</h1>
              <p className="text-[10px] uppercase tracking-widest text-slate-400 font-bold">System Weryfikacji Szkód</p>
            </div>
          </div>
          <div className="hidden sm:flex items-center gap-4 text-sm font-medium text-slate-500">
            <span className="flex items-center gap-1.5"><Camera className="w-4 h-4" /> Zdjęcia</span>
            <ChevronRight className="w-4 h-4 opacity-30" />
            <span className="flex items-center gap-1.5"><FileText className="w-4 h-4" /> Opis</span>
            <ChevronRight className="w-4 h-4 opacity-30" />
            <span className="flex items-center gap-1.5 text-indigo-600"><CheckCircle2 className="w-4 h-4" /> Wynik</span>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
          
          {/* Left Column: Input */}
          <div className="lg:col-span-7 space-y-8">
            <section className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold flex items-center gap-2">
                  <ImageIcon className="w-5 h-5 text-indigo-600" />
                  Pojazd Poszkodowanego
                </h2>
                <span className="text-xs font-medium text-slate-400">{victimImages.length} zdjęć</span>
              </div>
              
              <div 
                onClick={() => victimFileInputRef.current?.click()}
                className="group relative border-2 border-dashed border-slate-200 rounded-2xl p-8 transition-all hover:border-indigo-400 hover:bg-indigo-50/30 cursor-pointer overflow-hidden"
              >
                <input 
                  type="file" 
                  multiple 
                  accept="image/*" 
                  className="hidden" 
                  ref={victimFileInputRef}
                  onChange={(e) => handleImageUpload(e, 'victim')}
                />
                <div className="flex flex-col items-center text-center space-y-3">
                  <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center text-slate-400 group-hover:scale-110 group-hover:bg-indigo-100 group-hover:text-indigo-600 transition-all">
                    <Upload className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold">Wgraj zdjęcia poszkodowanego</p>
                    <p className="text-xs text-slate-400 mt-1">Kluczowe dla analizy uszkodzeń</p>
                  </div>
                </div>
              </div>

              {victimImages.length > 0 && (
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-3 mt-4">
                  <AnimatePresence>
                    {victimImages.map((img, idx) => (
                      <motion.div 
                        key={`victim-${idx}`}
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.9 }}
                        className="relative aspect-square rounded-xl overflow-hidden border border-slate-200 group shadow-sm"
                      >
                        <img src={img} alt={`Victim ${idx}`} className="w-full h-full object-cover" />
                        <button 
                          onClick={(e) => { e.stopPropagation(); removeImage(idx, 'victim'); }}
                          className="absolute top-1.5 right-1.5 p-1.5 bg-white/90 backdrop-blur-sm rounded-lg text-rose-600 opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              )}
            </section>

            <section className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold flex items-center gap-2">
                  <Car className="w-5 h-5 text-slate-400" />
                  Pojazd Sprawcy <span className="text-sm font-normal text-slate-400">(opcjonalne)</span>
                </h2>
                <span className="text-xs font-medium text-slate-400">{perpetratorImages.length} zdjęć</span>
              </div>
              
              <div 
                onClick={() => perpetratorFileInputRef.current?.click()}
                className="group relative border-2 border-dashed border-slate-200 rounded-2xl p-8 transition-all hover:border-slate-400 hover:bg-slate-50 cursor-pointer overflow-hidden"
              >
                <input 
                  type="file" 
                  multiple 
                  accept="image/*" 
                  className="hidden" 
                  ref={perpetratorFileInputRef}
                  onChange={(e) => handleImageUpload(e, 'perpetrator')}
                />
                <div className="flex flex-col items-center text-center space-y-3">
                  <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center text-slate-400 group-hover:scale-110 group-hover:bg-slate-200 transition-all">
                    <Camera className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-600">Wgraj zdjęcia sprawcy</p>
                    <p className="text-xs text-slate-400 mt-1">Pozwala na analizę porównawczą</p>
                  </div>
                </div>
              </div>

              {perpetratorImages.length > 0 && (
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-3 mt-4">
                  <AnimatePresence>
                    {perpetratorImages.map((img, idx) => (
                      <motion.div 
                        key={`perpetrator-${idx}`}
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.9 }}
                        className="relative aspect-square rounded-xl overflow-hidden border border-slate-200 group shadow-sm"
                      >
                        <img src={img} alt={`Perpetrator ${idx}`} className="w-full h-full object-cover" />
                        <button 
                          onClick={(e) => { e.stopPropagation(); removeImage(idx, 'perpetrator'); }}
                          className="absolute top-1.5 right-1.5 p-1.5 bg-white/90 backdrop-blur-sm rounded-lg text-rose-600 opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              )}
            </section>

            <section className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold flex items-center gap-2">
                  <FileText className="w-5 h-5 text-indigo-600" />
                  Opis Zdarzenia
                </h2>
                <div className="flex items-center gap-2">
                  <input 
                    type="file" 
                    accept="image/*,application/pdf" 
                    className="hidden" 
                    ref={ocrInputRef}
                    onChange={handleOcrUpload}
                  />
                  <button 
                    onClick={() => ocrInputRef.current?.click()}
                    disabled={isOcrLoading}
                    className="text-xs font-semibold text-indigo-600 bg-indigo-50 px-3 py-1.5 rounded-lg hover:bg-indigo-100 transition-colors flex items-center gap-1.5 disabled:opacity-50"
                  >
                    {isOcrLoading ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Upload className="w-3.5 h-3.5" />
                    )}
                    Wgraj opis (OCR)
                  </button>
                </div>
              </div>
              <textarea 
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Opisz przebieg zdarzenia, rozróżniając pojazd sprawcy i poszkodowanego (np. 'Pojazd sprawcy uderzył w tył mojego pojazdu (poszkodowany) podczas hamowania przed światłami...')"
                className="w-full h-40 p-4 rounded-2xl border border-slate-200 bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all resize-none text-sm leading-relaxed"
              />
            </section>

            <button 
              onClick={handleVerify}
              disabled={isAnalyzing || victimImages.length === 0 || !description.trim()}
              className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-semibold shadow-xl shadow-indigo-200 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 group"
            >
              {isAnalyzing ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Analizowanie dokumentacji...
                </>
              ) : (
                <>
                  Weryfikuj Zgodność
                  <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </>
              )}
            </button>

            {error && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-4 bg-rose-50 border border-rose-100 rounded-xl flex items-center gap-3 text-rose-600 text-sm"
              >
                <AlertCircle className="w-5 h-5 shrink-0" />
                {error}
              </motion.div>
            )}
          </div>

          {/* Right Column: Results */}
          <div className="lg:col-span-5">
            <div className="sticky top-24">
              <AnimatePresence mode="wait">
                {!result && !isAnalyzing && (
                  <motion.div 
                    key="placeholder"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="bg-white rounded-3xl border border-slate-200 p-8 text-center space-y-4 border-dashed"
                  >
                    <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center text-slate-300 mx-auto">
                      <Car className="w-8 h-8" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-slate-600">Oczekiwanie na dane</h3>
                      <p className="text-sm text-slate-400 mt-1">Wgraj zdjęcia i dodaj opis, aby rozpocząć proces weryfikacji przez AI.</p>
                    </div>
                  </motion.div>
                )}

                {isAnalyzing && (
                  <motion.div 
                    key="loading"
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="bg-white rounded-3xl border border-slate-200 p-8 space-y-6 shadow-sm overflow-hidden relative"
                  >
                    <div className="absolute top-0 left-0 w-full h-1 bg-slate-100">
                      <motion.div 
                        className="h-full bg-indigo-600"
                        animate={{ x: ['-100%', '100%'] }}
                        transition={{ repeat: Infinity, duration: 1.5, ease: "easeInOut" }}
                      />
                    </div>
                    <div className="space-y-4">
                      <div className="h-8 w-3/4 bg-slate-100 rounded-lg animate-pulse" />
                      <div className="space-y-2">
                        <div className="h-4 w-full bg-slate-50 rounded animate-pulse" />
                        <div className="h-4 w-5/6 bg-slate-50 rounded animate-pulse" />
                        <div className="h-4 w-4/6 bg-slate-50 rounded animate-pulse" />
                      </div>
                      <div className="pt-4 border-t border-slate-100 flex items-center gap-3">
                        <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
                        <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">AI przetwarza obrazy...</span>
                      </div>
                    </div>
                  </motion.div>
                )}

                {result && (
                  <motion.div 
                    key="result"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="space-y-4"
                  >
                    <div 
                      ref={resultRef}
                      className="bg-white rounded-3xl border border-slate-200 shadow-xl shadow-slate-200/50 overflow-hidden text-[#0f172a]"
                    >
                      <div 
                        className={cn("p-6 border-b flex items-center justify-between", getStatusColor(result.isConsistent).className)}
                        style={getStatusColor(result.isConsistent).style}
                      >
                        <div className="flex items-center gap-2.5">
                          {getStatusIcon(result.isConsistent)}
                          <span className="font-bold tracking-tight uppercase text-sm">{translateStatus(result.isConsistent)}</span>
                        </div>
                        <div className="text-[10px] font-bold opacity-60 uppercase tracking-widest">Werdykt AI</div>
                      </div>

                      <div className="p-8 space-y-8">
                        <section className="space-y-4">
                          <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Wykryte Uszkodzenia</h4>
                          <ul className="space-y-2">
                            {result.damages.map((damage, i) => (
                              <li key={i} className="flex items-start gap-3 text-sm">
                                <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 mt-1.5 shrink-0" />
                                <span className="text-slate-700">{damage}</span>
                              </li>
                            ))}
                          </ul>
                        </section>

                        <section className="space-y-4">
                          <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Analiza i Uzasadnienie</h4>
                          <div className="prose prose-sm prose-slate max-w-none">
                            <div className="text-sm leading-relaxed text-slate-600 bg-slate-50 p-4 rounded-2xl border border-slate-100">
                              <Markdown>{result.reasoning}</Markdown>
                            </div>
                          </div>
                        </section>

                        {/* Unrelated Damages Section */}
                        {result.unrelatedDamages && result.unrelatedDamages.length > 0 && (
                          <section className="space-y-6 pt-6 border-t border-slate-100">
                            <div className="flex items-center gap-2">
                              <AlertTriangle className="w-4 h-4 text-rose-500" />
                              <h4 className="text-xs font-bold text-slate-900 uppercase tracking-widest">Wykryte Uszkodzenia Bez Związku</h4>
                            </div>
                            <div className="space-y-8">
                              {Array.from(new Set(result.unrelatedDamages.map(d => d.imageIndex))).map(imgIdx => (
                                <div key={imgIdx} className="space-y-4">
                                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Zdjęcie pojazdu poszkodowanego #{imgIdx + 1}:</p>
                                  <DamageOverlay 
                                    image={victimImages[imgIdx]} 
                                    damages={result.unrelatedDamages.filter(d => d.imageIndex === imgIdx)} 
                                  />
                                  <ul className="space-y-3">
                                    {result.unrelatedDamages.filter(d => d.imageIndex === imgIdx).map((d, i) => (
                                      <li key={i} className="flex gap-3 text-sm text-slate-600 bg-slate-50/50 p-4 rounded-2xl border border-slate-100">
                                        <div className="mt-1">
                                          <div className={`w-2.5 h-2.5 rounded-full ${d.type === 'pre_existing' ? 'bg-rose-500' : 'bg-amber-500'}`} />
                                        </div>
                                        <div>
                                          <span className="font-bold text-slate-900 block mb-0.5">
                                            {d.type === 'pre_existing' ? 'Prawdopodobnie stare uszkodzenie:' : 'Brak związku ze zdarzeniem:'}
                                          </span>
                                          {d.description}
                                        </div>
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              ))}
                            </div>
                          </section>
                        )}
                      </div>
                    </div>

                    <div className="flex gap-3">
                      <button 
                        onClick={handleExportPdf}
                        disabled={isExporting}
                        className="flex-1 py-3 bg-slate-900 text-white rounded-xl font-semibold text-sm flex items-center justify-center gap-2 hover:bg-slate-800 transition-all disabled:opacity-50"
                      >
                        {isExporting ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Download className="w-4 h-4" />
                        )}
                        Pobierz PDF
                      </button>
                      <button 
                        onClick={() => { setResult(null); setVictimImages([]); setPerpetratorImages([]); setDescription(''); }}
                        className="flex-1 py-3 text-sm font-semibold text-slate-500 hover:text-indigo-600 transition-colors border border-slate-200 rounded-xl hover:bg-slate-50"
                      >
                        Nowa Analiza
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </main>

      <footer className="max-w-5xl mx-auto px-6 py-12 border-t border-slate-100 mt-12">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-2 opacity-40 grayscale">
            <Car className="w-5 h-5" />
            <span className="text-sm font-bold tracking-tighter">AutoDamage Verifier</span>
          </div>
          <p className="text-xs text-slate-400 text-center md:text-right">
            System wykorzystuje zaawansowane modele wizyjne do analizy uszkodzeń.<br />
            Wynik ma charakter pomocniczy i powinien być zweryfikowany przez rzeczoznawcę.
          </p>
        </div>
      </footer>
    </div>
  );
}
