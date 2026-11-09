import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  GAME_DATA,
  SupportedLocale,
  getIngredientImageUrl,
  getSkillImageUrl,
} from '@pokesleep/data';
import { MEW_LEARNED_SKILLS } from '@pokesleep/engine';
import { BoxPokemon, normalizeBoxSubskills } from '../storage/db';
import { getEntityName, getNatureModLabel, getUIText } from '../i18n';
import { PokemonSelector } from './PokemonSelector';
import { X, Upload, FileText, Sparkles, Loader2, Pencil, Image as ImageIcon, Lock } from 'lucide-react';

export const isFixedNaturePokemon = (name?: string): boolean => {
  const u = (name || '').toUpperCase();
  return u === 'MEW' || u === 'DARKRAI';
};

interface AddPokemonModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (pokemon: BoxPokemon) => void;
  locale: SupportedLocale;
  initialData?: Partial<BoxPokemon>;
}

export const AddPokemonModal: React.FC<AddPokemonModalProps> = ({
  isOpen,
  onClose,
  onSave,
  locale,
  initialData,
}) => {
  const isEditMode = Boolean(initialData?.id);
  const [activeMode, setActiveMode] = useState<'manual' | 'ocr'>('manual');
  const [pokemonName, setPokemonName] = useState(initialData?.pokemonName || 'PIKACHU');
  const [nickname, setNickname] = useState(initialData?.nickname || '');
  const [level, setLevel] = useState(initialData?.level || 25);
  const [nature, setNature] = useState(
    isFixedNaturePokemon(initialData?.pokemonName) ? 'Bashful' : initialData?.nature || 'Adamant'
  );
  const [subskills, setSubskills] = useState(() => normalizeBoxSubskills(initialData?.subskills));
  const [ingredients, setIngredients] = useState({
    slotA: initialData?.ingredients?.slotA || 'Apple',
    slotB: initialData?.ingredients?.slotB || 'Apple',
    slotC: initialData?.ingredients?.slotC || 'Apple',
  });
  const [mainSkillLevel, setMainSkillLevel] = useState(initialData?.mainSkillLevel || 1);
  const [ribbonLevel, setRibbonLevel] = useState(initialData?.ribbonLevel || 0);
  const [mewLearnedSkill, setMewLearnedSkill] = useState(initialData?.mewLearnedSkill || 'Metronome');

  // Transition lifecycle states
  const [shouldRender, setShouldRender] = useState(isOpen);
  const [isClosing, setIsClosing] = useState(false);

  // OCR state
  const [ocrText, setOcrText] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [ocrMessage, setOcrMessage] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [lowConfidenceFields, setLowConfidenceFields] = useState<string[]>([]);

  // Smooth close request
  const requestClose = useCallback(() => {
    setIsClosing(true);
    setTimeout(() => {
      onClose();
    }, 180);
  }, [onClose]);

  // Sync animation mounting
  useEffect(() => {
    if (isOpen) {
      setShouldRender(true);
      setIsClosing(false);
    } else if (shouldRender) {
      setIsClosing(true);
      const timer = setTimeout(() => {
        setShouldRender(false);
        setIsClosing(false);
      }, 180);
      return () => clearTimeout(timer);
    }
  }, [isOpen, shouldRender]);

  // Handle Escape key
  useEffect(() => {
    if (!shouldRender) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        requestClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [shouldRender, requestClose]);

  // Sync form state whenever modal opens or initialData changes
  useEffect(() => {
    if (!isOpen) return;
    if (initialData && initialData.pokemonName) {
      const sp =
        GAME_DATA.pokemon.find(
          (p) => p.name.toUpperCase() === initialData.pokemonName!.toUpperCase()
        ) || GAME_DATA.pokemon[0];
      setPokemonName(sp.name);
      setNickname(initialData.nickname || '');
      setLevel(Math.min(70, Math.max(1, initialData.level || 25)));
      setNature(
        isFixedNaturePokemon(initialData.pokemonName) ? 'Bashful' : initialData.nature || 'Adamant'
      );
      setSubskills(normalizeBoxSubskills(initialData.subskills));
      setIngredients({
        slotA: initialData.ingredients?.slotA || sp.ingredient0?.[0]?.ingredient || 'Apple',
        slotB: initialData.ingredients?.slotB || sp.ingredient30?.[0]?.ingredient || 'Locked',
        slotC: initialData.ingredients?.slotC || sp.ingredient60?.[0]?.ingredient || 'Locked',
      });
      setMainSkillLevel(initialData.mainSkillLevel || 1 + (sp.previousEvolutions || 0));
      setRibbonLevel(initialData.ribbonLevel || 0);
      setMewLearnedSkill(initialData.mewLearnedSkill || 'Metronome');
      setActiveMode('manual');
    } else {
      setPokemonName('PIKACHU');
      setNickname('');
      setLevel(25);
      setNature('Adamant');
      setSubskills({
        level10: 'Berry Finding S',
        level25: 'Helping Speed M',
        level50: '',
        level70: '',
        level80: '',
      });
      setIngredients({ slotA: 'Apple', slotB: 'Apple', slotC: 'Apple' });
      setMainSkillLevel(1);
      setRibbonLevel(0);
      setMewLearnedSkill('Metronome');
    }
    setOcrMessage(null);
    setPreviewUrl(null);
  }, [isOpen, initialData]);

  const currentSpecies = useMemo(() => {
    return (
      GAME_DATA.pokemon.find((p) => p.name.toUpperCase() === pokemonName.toUpperCase()) ||
      GAME_DATA.pokemon[0]
    );
  }, [pokemonName]);

  const validSlotA = useMemo(
    () => (currentSpecies.ingredient0 || []).filter((i) => i.ingredient !== 'Locked'),
    [currentSpecies]
  );
  const validSlotB = useMemo(() => {
    const list = currentSpecies.ingredient30 || [];
    const hasLocked = list.some((i) => i.ingredient === 'Locked');
    return hasLocked ? list : [...list, { ingredient: 'Locked', amount: 0 }];
  }, [currentSpecies]);
  const validSlotC = useMemo(() => {
    const list = currentSpecies.ingredient60 || [];
    const hasLocked = list.some((i) => i.ingredient === 'Locked');
    return hasLocked ? list : [...list, { ingredient: 'Locked', amount: 0 }];
  }, [currentSpecies]);

  // Ensure ingredient slots always stay valid for current species
  useEffect(() => {
    setIngredients((prev) => {
      const validA = validSlotA.map((i) => i.ingredient);
      const validB = validSlotB.map((i) => i.ingredient);
      const validC = validSlotC.map((i) => i.ingredient);

      const safeA = validA.includes(prev.slotA) ? prev.slotA : (validA[0] || 'Apple');
      const safeB =
        prev.slotB === 'Locked' || validB.includes(prev.slotB || '')
          ? prev.slotB
          : (validB[0] || 'Locked');
      const safeC =
        prev.slotC === 'Locked' || validC.includes(prev.slotC || '')
          ? prev.slotC
          : (validC[0] || 'Locked');

      if (safeA !== prev.slotA || safeB !== prev.slotB || safeC !== prev.slotC) {
        return { slotA: safeA, slotB: safeB, slotC: safeC };
      }
      return prev;
    });
  }, [validSlotA, validSlotB, validSlotC]);

  const handleSpeciesChange = (newSpeciesName: string) => {
    setPokemonName(newSpeciesName);
    const sp = GAME_DATA.pokemon.find(
      (p) => p.name.toUpperCase() === newSpeciesName.toUpperCase()
    );
    if (sp) {
      if (isFixedNaturePokemon(sp.name)) {
        setNature('Bashful');
      }
      if (sp.name.toUpperCase() === 'MEW') {
        setMewLearnedSkill('Metronome');
      }
      const validA = (sp.ingredient0 || []).map((i) => i.ingredient).filter((x) => x !== 'Locked');
      const validB = (sp.ingredient30 || []).map((i) => i.ingredient);
      const validC = (sp.ingredient60 || []).map((i) => i.ingredient);

      setIngredients((prev) => ({
        slotA: validA.includes(prev.slotA) ? prev.slotA : (validA[0] || 'Apple'),
        slotB: validB.includes(prev.slotB || '') ? prev.slotB : (validB[0] || 'Locked'),
        slotC: validC.includes(prev.slotC || '') ? prev.slotC : (validC[0] || 'Locked'),
      }));
      setMainSkillLevel(Math.min(sp.skill.maxLevel || 6, 1 + (sp.previousEvolutions || 0)));
    }
  };

  const processFileForOcr = async (file: File) => {
    try {
      const objUrl = URL.createObjectURL(file);
      setPreviewUrl(objUrl);
    } catch {
      // ignore preview error
    }

    setIsScanning(true);
    setOcrMessage(locale === 'zh-TW' ? '正在上傳並執行 RapidOCR 模型解析面板與副技能...' : '正在上传并运行 RapidOCR 模型解析面板与副技能...');
    const formData = new FormData();
    formData.append('file', file, file.name || 'screenshot.png');
    try {
      const res = await fetch('/api/ocr/scan-image', {
        method: 'POST',
        body: formData,
      });
      if (res.ok) {
        const data = await res.json();
        applyOcrData(data.parsed);
        const rpHint = data.parsed.rp ? ` | SP ${data.parsed.rp}` : '';
        const shinyHint = data.parsed.isShiny ? ' ✨ 识别为异色闪光！' : '';
        const nickHint = data.parsed.nickname ? `（备注：${data.parsed.nickname}）` : '';
        const pokemonDisplay = data.parsed.pokemon?.displayName || data.parsed.pokemon?.name;
        if (!pokemonDisplay) {
          setOcrMessage(
            locale === 'zh-TW'
              ? `⚠️ 面板辨識完成，但未能確認寶可夢物種${nickHint}，請在下方手動點選寶可夢！`
              : `⚠️ 面板识别完成，但未能确认宝可梦物种${nickHint}，请在下方手动点选宝可梦！`
          );
        } else {
          setOcrMessage(
            locale === 'zh-TW'
              ? `辨識成功！物種：${pokemonDisplay}${nickHint} Lv.${data.parsed.level || '?'}${rpHint}${shinyHint}（已自動填入表單供核對）`
              : `识别成功！物种：${pokemonDisplay}${nickHint} Lv.${data.parsed.level || '?'}${rpHint}${shinyHint}（已自动填入表单供核对）`
          );
        }
      } else {
        const errData = await res.json().catch(() => null);
        setOcrMessage(errData?.detail || (locale === 'zh-TW' ? '後端 OCR 處理失敗，請檢查檔案是否為有效截圖。' : '后端 OCR 处理失败，请检查文件是否为有效截图。'));
      }
    } catch {
      setOcrMessage(locale === 'zh-TW' ? '無法連線到後端 OCR 服務，請確認後端已啟動或直接貼上文字辨識。' : '无法连接到后端 OCR 服务，请确认后端已启动或直接粘贴文本识别。');
    } finally {
      setIsScanning(false);
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await processFileForOcr(file);
    e.target.value = '';
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      await processFileForOcr(file);
    }
  };

  const handlePaste = async (e: React.ClipboardEvent<HTMLDivElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        const file = items[i].getAsFile();
        if (file) {
          e.preventDefault();
          await processFileForOcr(file);
          return;
        }
      }
    }
  };

  const handleOcrTextParse = async () => {
    if (!ocrText.trim()) return;
    setIsScanning(true);
    setOcrMessage(null);
    try {
      const res = await fetch('/api/ocr/parse-text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: ocrText }),
      });
      if (res.ok) {
        const data = await res.json();
        applyOcrData(data);
        setOcrMessage(locale === 'zh-TW' ? `辨識成功！匹配物種：${data.pokemon?.displayName || data.pokemon?.name}` : `识别成功！匹配物种：${data.pokemon?.displayName || data.pokemon?.name}`);
      } else {
        fallbackClientOcr(ocrText);
      }
    } catch {
      fallbackClientOcr(ocrText);
    } finally {
      setIsScanning(false);
    }
  };

  const applyOcrData = (parsed: any) => {
    let targetSpecies = currentSpecies;
    if (parsed.pokemon?.name) {
      const sp = GAME_DATA.pokemon.find(
        (p) => p.name.toUpperCase() === parsed.pokemon.name.toUpperCase()
      );
      if (sp) {
        targetSpecies = sp;
        setPokemonName(sp.name);
      }
    }
    if (parsed.nickname) {
      setNickname(parsed.nickname);
    }
    if (parsed.level) {
      setLevel(Math.min(70, Math.max(1, parsed.level)));
    }
    if (isFixedNaturePokemon(targetSpecies.name)) {
      setNature('Bashful');
    } else if (parsed.nature?.name) {
      setNature(parsed.nature.name);
    } else {
      // If nature was cropped or not detected, reset to neutral 'Bashful' (害羞), never leak previous Pokemon's nature!
      setNature('Bashful');
    }
    if (parsed.mainSkillLevel) {
      setMainSkillLevel(parsed.mainSkillLevel);
    }
    if (parsed.subskills && Array.isArray(parsed.subskills)) {
      const nextSubs = {
        level10: '',
        level25: '',
        level50: '',
        level70: '',
        level80: '',
      };
      const usedNames = new Set<string>();
      for (const s of parsed.subskills) {
        const slot =
          s.slot === 'level75' ? 'level70' : s.slot === 'level100' ? 'level80' : s.slot;
        if (slot && s.name && slot in nextSubs && !usedNames.has(s.name)) {
          (nextSubs as any)[slot] = s.name;
          usedNames.add(s.name);
        }
      }
      setSubskills(nextSubs);
    }
    const validA = (targetSpecies.ingredient0 || []).map((i) => i.ingredient).filter((x) => x !== 'Locked');
    const validB = (targetSpecies.ingredient30 || []).map((i) => i.ingredient);
    const validC = (targetSpecies.ingredient60 || []).map((i) => i.ingredient);

    const nextIngs = {
      slotA: validA[0] || 'Apple',
      slotB: validB.includes('Locked') ? 'Locked' : validB[0] || 'Locked',
      slotC: validC.includes('Locked') ? 'Locked' : validC[0] || 'Locked',
    };

    let detectedSlotsCount = 0;
    if (parsed.ingredients && Array.isArray(parsed.ingredients)) {
      for (const ing of parsed.ingredients) {
        if (ing.slot === 'slotA' && ing.name && validA.includes(ing.name)) {
          nextIngs.slotA = ing.name;
          detectedSlotsCount++;
        }
        if (ing.slot === 'slotB' && ing.name && validB.includes(ing.name)) {
          nextIngs.slotB = ing.name;
          detectedSlotsCount++;
        }
        if (ing.slot === 'slotC' && ing.name && validC.includes(ing.name)) {
          nextIngs.slotC = ing.name;
          detectedSlotsCount++;
        }
      }
    }
    setIngredients(nextIngs);

    // Intelligent UI Highlighting for low confidence / missing fields
    const lowFields: string[] = [];
    if (!parsed.pokemon?.name || (parsed.fieldConfidences?.pokemon ?? 1.0) < 0.60) {
      lowFields.push('pokemon');
    }
    if (detectedSlotsCount < 2 || (parsed.fieldConfidences?.ingredients ?? 1.0) < 0.58) {
      lowFields.push('ingredients');
    }
    if ((parsed.fieldConfidences?.mainSkillLevel ?? 1.0) < 0.65) {
      lowFields.push('mainSkillLevel');
    }
    if (!parsed.nature?.name || (parsed.fieldConfidences?.nature ?? 1.0) < 0.65) {
      lowFields.push('nature');
    }
    setLowConfidenceFields(lowFields);
    setActiveMode('manual');
  };

  const fallbackClientOcr = (text: string) => {
    const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
    for (const l of lines) {
      const pkmn = GAME_DATA.pokemon.find(
        (p) =>
          p.name.toLowerCase().includes(l.toLowerCase()) ||
          p.displayName.toLowerCase().includes(l.toLowerCase()) ||
          (p.translations &&
            Object.values(p.translations).some(
              (t) => typeof t === 'string' && t.toLowerCase().includes(l.toLowerCase())
            ))
      );
      if (pkmn) {
        handleSpeciesChange(pkmn.name);
        break;
      }
    }
    setOcrMessage(locale === 'zh-TW' ? '本地前端詞庫模糊匹配完成，請核對資訊。' : '本地前端词库模糊匹配完成，请核对信息。');
    setActiveMode('manual');
  };

  const handleSave = () => {
    const newPkmn: BoxPokemon = {
      id: initialData?.id || `pkmn_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      pokemonName,
      nickname: nickname.trim() || undefined,
      level: Math.min(70, Math.max(1, level)),
      nature: isFixedNaturePokemon(pokemonName) ? 'Bashful' : nature,
      subskills,
      ingredients,
      mainSkillLevel,
      ribbonLevel,
      mewLearnedSkill: pokemonName.toUpperCase() === 'MEW' ? mewLearnedSkill : undefined,
      createdAt: initialData?.createdAt || Date.now(),
    };
    onSave(newPkmn);
    requestClose();
  };

  if (!shouldRender) return null;

  const maxSkillLvl = currentSpecies.skill.maxLevel || 6;

  return (
    <div
      className={`modal-backdrop ${isClosing ? 'animate-backdrop-out' : 'animate-backdrop-in'}`}
      onPaste={handlePaste}
      onClick={requestClose}
    >
      <div
        className={`modal-panel p-4 sm:p-6 ${isClosing ? 'animate-panel-out' : 'animate-panel-in'}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header with Camp Slumber Journal Typography */}
        <div className="flex items-center justify-between pb-3.5 border-b border-[#eae4d6]">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-xl bg-[var(--primary-light)] flex items-center justify-center text-[var(--primary)]">
              {isEditMode ? <Pencil className="w-4 h-4" /> : <Sparkles className="w-4 h-4" />}
            </div>
            <div>
              <h2 className="text-base font-bold text-[var(--text-main)] leading-tight">
                {isEditMode ? getUIText('editPokemon', locale) : getUIText('addPokemon', locale)}
              </h2>
              <p className="text-[11px] text-[var(--text-muted)]">
                {getUIText('journalSubtitle', locale)}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={requestClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-[#f4efe6] tap-feedback cursor-pointer transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Apple-style Segmented Control Toggle */}
        <div className="bg-[#f4efe6] p-1 rounded-xl flex space-x-1 my-3.5">
          <button
            type="button"
            onClick={() => setActiveMode('manual')}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-lg tap-feedback transition-all cursor-pointer ${
              activeMode === 'manual'
                ? 'bg-white text-[var(--primary)] shadow-2xs'
                : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'
            }`}
          >
            {getUIText('tabManual', locale)}
          </button>
          <button
            type="button"
            onClick={() => setActiveMode('ocr')}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-lg tap-feedback transition-all cursor-pointer ${
              activeMode === 'ocr'
                ? 'bg-white text-[var(--primary)] shadow-2xs'
                : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'
            }`}
          >
            {getUIText('tabOcr', locale)}
          </button>
        </div>

        {ocrMessage && (
          <div className="mb-3.5 p-3 bg-[#ebf3fb] border border-[#d2e4f6] rounded-xl text-xs text-[#2c4c74] flex items-center justify-between">
            <span>{ocrMessage}</span>
          </div>
        )}

        {/* OCR Panel */}
        {activeMode === 'ocr' && (
          <div className="space-y-4 py-1">
            <div>
              <label className="block text-xs font-semibold text-[var(--text-main)] mb-1.5">
                {getUIText('ocrUploadLabel', locale)}
              </label>
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                className={`border-2 border-dashed rounded-2xl p-6 text-center transition-all ${
                  isDragging
                    ? 'border-[var(--primary)] bg-[var(--primary-light)]'
                    : 'border-[#d8cfbf] hover:border-[var(--primary)] bg-[#fbf9f4]'
                }`}
              >
                {previewUrl ? (
                  <img
                    src={previewUrl}
                    alt="OCR Preview"
                    className="max-h-36 mx-auto mb-3 rounded-xl border border-[#eae4d6] shadow-xs object-contain"
                  />
                ) : (
                  <Upload className="w-8 h-8 text-[var(--text-subtle)] mx-auto mb-2" />
                )}
                <label className="btn btn-primary cursor-pointer text-xs">
                  {isScanning ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                      {getUIText('scanningOcr', locale)}
                    </>
                  ) : (
                    <>
                      <ImageIcon className="w-4 h-4 mr-1.5" />
                      {getUIText('selectImageFile', locale)}
                    </>
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    className="hidden"
                  />
                </label>
                <p className="text-xs text-[var(--text-muted)] mt-2.5">
                  {getUIText('ocrDropHint', locale)}
                </p>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[var(--text-main)] mb-1">
                {getUIText('ocrTextLabel', locale)}
              </label>
              <textarea
                rows={3}
                value={ocrText}
                onChange={(e) => setOcrText(e.target.value)}
                placeholder={'Lv.41 蜥蜴王 / Sceptile\nLv.10 技能幾率提升M\nLv.25 持有上限提升S\nLv.50 樹果數量S\n性格 悠閒'}
                className="input-field text-xs font-mono"
              />
              <button
                type="button"
                onClick={handleOcrTextParse}
                disabled={isScanning || !ocrText.trim()}
                className="btn btn-secondary mt-2 w-full text-xs"
              >
                <FileText className="w-3.5 h-3.5 mr-1.5" />
                {getUIText('ocrParseBtn', locale)}
              </button>
            </div>
          </div>
        )}

        {/* Manual Input Form */}
        {activeMode === 'manual' && (
          <div className="space-y-3.5 py-1 max-h-[58dvh] sm:max-h-[62vh] overflow-y-auto px-0.5 pr-1.5">
            {/* Species Selector */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-semibold text-[var(--text-main)]">
                  {getUIText('speciesLabel', locale)}
                </label>
                {lowConfidenceFields.includes('pokemon') && (
                  <span className="text-2xs font-semibold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-300 animate-pulse">
                    {locale === 'zh-TW' ? '⚠️ 未能確認寶可夢，請手動點選' : '⚠️ 未能确认宝可梦，请手动点选'}
                  </span>
                )}
              </div>
              <div className={lowConfidenceFields.includes('pokemon') ? 'p-1 rounded-xl border border-amber-400 bg-amber-50/60 shadow-xs' : ''}>
                <PokemonSelector
                  value={pokemonName}
                  onChange={(val) => {
                    handleSpeciesChange(val);
                    setLowConfidenceFields((prev) => prev.filter((f) => f !== 'pokemon'));
                  }}
                  locale={locale}
                />
              </div>
            </div>

            {/* Nickname, Level & Main Skill Level */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <div>
                <label className="block text-xs font-semibold text-[var(--text-main)] mb-1">
                  {getUIText('nicknameLabel', locale)}
                </label>
                <input
                  type="text"
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  placeholder={getUIText('nicknamePlaceholder', locale)}
                  className="input-field text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--text-main)] mb-1">
                  {getUIText('currentLevelLabel', locale)}
                </label>
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={70}
                  value={level}
                  onChange={(e) => setLevel(Math.min(70, Math.max(1, Number(e.target.value))))}
                  className="input-field text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--text-main)] mb-1 flex items-center space-x-1">
                  <img
                    src={getSkillImageUrl(currentSpecies.skill.image)}
                    alt=""
                    className="w-3.5 h-3.5 object-contain"
                  />
                  <span>{getUIText('mainSkillLevelLabel', locale)} (1–{maxSkillLvl})</span>
                </label>
                <select
                  value={mainSkillLevel}
                  onChange={(e) => setMainSkillLevel(Number(e.target.value))}
                  className="input-field text-xs"
                >
                  {Array.from({ length: maxSkillLvl }, (_, i) => i + 1).map((lvl) => (
                    <option key={lvl} value={lvl}>
                      Lv.{lvl} ({currentSpecies.skill.translations?.[locale] || currentSpecies.skill.name})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Nature & Ribbon (睡飽飽獎章 / 睡饱饱徽章) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-semibold text-[var(--text-main)]">
                    {getUIText('nature', locale)}
                  </label>
                  {lowConfidenceFields.includes('nature') && !isFixedNaturePokemon(pokemonName) && (
                    <span className="text-2xs font-semibold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-300 animate-pulse">
                      {locale === 'zh-TW' ? '⚠️ 截圖未包含性格，已預設害羞請確認' : '⚠️ 截图未包含性格，已默认害羞请确认'}
                    </span>
                  )}
                </div>
                <select
                  value={isFixedNaturePokemon(pokemonName) ? 'Bashful' : nature}
                  disabled={isFixedNaturePokemon(pokemonName)}
                  onChange={(e) => {
                    setNature(e.target.value);
                    setLowConfidenceFields(lowConfidenceFields.filter((f) => f !== 'nature'));
                  }}
                  className={`input-field text-xs ${
                    isFixedNaturePokemon(pokemonName)
                      ? 'bg-slate-50 text-slate-500 cursor-not-allowed border-slate-200'
                      : lowConfidenceFields.includes('nature')
                        ? 'border-amber-400 ring-2 ring-amber-400/30 bg-amber-50/40'
                        : ''
                  }`}
                >
                  {GAME_DATA.natures.map((n) => (
                    <option key={n.name} value={n.name}>
                      {getEntityName(n, locale)}
                      {n.positiveModifier && n.positiveModifier !== 'neutral'
                        ? ` (▲${getNatureModLabel(n.positiveModifier, locale)} ▼${getNatureModLabel(n.negativeModifier, locale)})`
                        : ` (${getUIText('noMod', locale)})`}
                    </option>
                  ))}
                </select>
                {isFixedNaturePokemon(pokemonName) && (
                  <p className="text-[11px] text-blue-700 mt-1 flex items-center font-medium">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500 mr-1 shrink-0" />
                    {locale === 'zh-TW'
                      ? '幻之寶可夢專屬：性格固定為「害羞」（無增減修正）'
                      : '幻之宝可梦专属：性格固定为「害羞」（无增减修正）'}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--text-main)] mb-1">
                  {getUIText('ribbonTitle', locale)}
                </label>
                <select
                  value={ribbonLevel}
                  onChange={(e) => setRibbonLevel(Number(e.target.value))}
                  className="input-field text-xs"
                >
                  <option value={0}>{getUIText('ribbonLevel0', locale)}</option>
                  <option value={1}>{getUIText('ribbonLevel1', locale)}</option>
                  <option value={2}>{getUIText('ribbonLevel2', locale)}</option>
                  <option value={3}>{getUIText('ribbonLevel3', locale)}</option>
                  <option value={4}>{getUIText('ribbonLevel4', locale)}</option>
                </select>
              </div>
            </div>

            {/* Mew's Unique Versatile Skill Selector (灵感之种) */}
            {pokemonName.toUpperCase() === 'MEW' && (
              <div className="p-3 rounded-xl border border-blue-200 bg-blue-50/50 space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-blue-900 flex items-center">
                    <Sparkles className="w-3.5 h-3.5 text-blue-600 mr-1" />
                    {locale === 'zh-TW' ? '十項全能 · 靈感之種已習得技能' : '十项全能 · 灵感之种已习得技能'}
                  </label>
                  <span className="text-[10px] text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full font-medium">
                    {locale === 'zh-TW' ? '附贈隊伍糖果' : '附赠队伍糖果'}
                  </span>
                </div>
                <select
                  value={mewLearnedSkill}
                  onChange={(e) => setMewLearnedSkill(e.target.value)}
                  className="input-field text-xs py-1.5 bg-white border-blue-300"
                >
                  {MEW_LEARNED_SKILLS.map((item) => (
                    <option key={item.id} value={item.id}>
                      [{item.role}] {locale === 'en' ? item.name : item.nameZh}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-blue-700/80 leading-relaxed">
                  {MEW_LEARNED_SKILLS.find((s) => s.id === mewLearnedSkill)?.description ||
                    '每次发动必定获得队伍糖果，并施展此技能的效果。'}
                </p>
              </div>
            )}

            {/* Subskills Selection */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold text-[var(--text-main)]">
                  {getUIText('subskills', locale)}
                </label>
                <span className="text-[11px] text-[var(--text-muted)]">
                  {getUIText('subskillsAvailable', locale)} Lv.{level}
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {(
                  [
                    { lvl: 10, key: 'level10' as const, capLocked: false },
                    { lvl: 25, key: 'level25' as const, capLocked: false },
                    { lvl: 50, key: 'level50' as const, capLocked: false },
                    { lvl: 70, key: 'level70' as const, capLocked: false },
                    { lvl: 80, key: 'level80' as const, capLocked: true },
                  ]
                ).map(({ lvl, key, capLocked }) => (
                  <div
                    key={key}
                    className={`flex items-center space-x-2 p-1.5 rounded-xl border transition-all ${
                      capLocked
                        ? 'bg-[#f7f5ee] border-[#eae4d6] opacity-75'
                        : level >= lvl
                          ? 'bg-white border-[#d8cfbf] shadow-2xs'
                          : 'bg-[#faf8f3] border-[#eae4d6]'
                    }`}
                  >
                    <span
                      className={`text-xs font-bold w-14 shrink-0 flex items-center ${
                        capLocked
                          ? 'text-[var(--text-subtle)]'
                          : level >= lvl
                            ? 'text-[var(--primary)]'
                            : 'text-[var(--text-muted)]'
                      }`}
                    >
                      {capLocked && <Lock className="w-2.5 h-2.5 mr-0.5" />}
                      Lv.{lvl}
                    </span>
                    <select
                      value={subskills[key]}
                      onChange={(e) => setSubskills({ ...subskills, [key]: e.target.value })}
                      className="input-field text-xs py-1"
                    >
                      <option value="">{getUIText('notSet', locale)}</option>
                      {GAME_DATA.subskills.map((s) => {
                        const isUsedInOtherSlot = Object.entries(subskills).some(
                          ([k, v]) => k !== key && v === s.name
                        );
                        return (
                          <option key={s.name} value={s.name} disabled={isUsedInOtherSlot}>
                            [{s.rarity === 'gold' ? (locale === 'en' ? 'G' : '金') : s.rarity === 'silver' ? (locale === 'en' ? 'S' : '银') : (locale === 'en' ? 'W' : '白')}] {getEntityName(s, locale)}{isUsedInOtherSlot ? (locale === 'en' ? ' (Selected)' : ' (已选)') : ''}
                          </option>
                        );
                      })}
                    </select>
                  </div>
                ))}
              </div>
            </div>

            {/* Ingredients Selection: Pantry Tray */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-semibold text-[var(--text-main)]">
                  {getUIText('ingredients', locale)} (A: Lv.1 / B: Lv.30 / C: Lv.60)
                </label>
                {lowConfidenceFields.includes('ingredients') && (
                  <span className="text-2xs font-semibold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-300 animate-pulse">
                    {locale === 'zh-TW' ? '⚠️ 截圖未包含食材欄，請手動確認' : '⚠️ 截图未包含清晰食材栏，请手动确认'}
                  </span>
                )}
              </div>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: getUIText('slotA', locale), key: 'slotA' as const, list: validSlotA },
                  { label: getUIText('slotB', locale), key: 'slotB' as const, list: validSlotB },
                  { label: getUIText('slotC', locale), key: 'slotC' as const, list: validSlotC },
                ].map(({ label, key, list }) => {
                  const rawIng = ingredients[key];
                  const selectedIng = list.some((i) => i.ingredient === rawIng)
                    ? rawIng
                    : (list[0]?.ingredient || rawIng);
                  const isLowConf = lowConfidenceFields.includes('ingredients');
                  return (
                    <div
                      key={key}
                      className={`p-2.5 rounded-xl border transition-all ${
                        isLowConf
                          ? 'border-amber-400 bg-amber-50/60 shadow-xs'
                          : 'border-[#eae4d6] bg-[#f7f5ee]'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-2xs text-[var(--text-muted)] font-semibold">{label}</span>
                        {selectedIng && selectedIng !== 'Locked' ? (
                          <img
                            src={getIngredientImageUrl(selectedIng)}
                            alt={selectedIng}
                            className="w-4 h-4 object-contain"
                          />
                        ) : selectedIng === 'Locked' ? (
                          <Lock className="w-3.5 h-3.5 text-slate-400" />
                        ) : null}
                      </div>
                      <select
                        value={selectedIng}
                        onChange={(e) => {
                          setIngredients({ ...ingredients, [key]: e.target.value });
                          setLowConfidenceFields((prev) => prev.filter((f) => f !== 'ingredients'));
                        }}
                        className="input-field text-xs py-1 bg-white"
                      >
                        {list.map((item) => {
                          const isLocked = item.ingredient === 'Locked';
                          const ingObj = GAME_DATA.ingredients.find(
                            (i) => i.name.toLowerCase() === item.ingredient.toLowerCase()
                          );
                          return (
                            <option key={item.ingredient} value={item.ingredient}>
                              {isLocked
                                ? (locale === 'en' ? '🔒 (Locked / Empty)' : '🔒 (未解锁 / 空)')
                                : `${ingObj ? getEntityName(ingObj, locale) : item.ingredient} ×${item.amount}`}
                            </option>
                          );
                        })}
                      </select>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Action Buttons with Apple-style Fluid Press */}
        <div className="flex justify-end space-x-2 pt-3.5 border-t border-[#eae4d6] mt-4">
          <button type="button" onClick={requestClose} className="btn btn-secondary tap-feedback text-xs">
            {getUIText('cancel', locale)}
          </button>
          <button type="button" onClick={handleSave} className="btn btn-primary tap-feedback text-xs">
            {isEditMode ? getUIText('saveChanges', locale) : getUIText('save', locale)}
          </button>
        </div>
      </div>
    </div>
  );
};
