import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  GAME_DATA,
  SupportedLocale,
  getIngredientImageUrl,
  getSkillImageUrl,
} from '@pokesleep/data';
import { BoxPokemon, normalizeBoxSubskills } from '../storage/db';
import { getEntityName, getNatureModLabel, getUIText } from '../i18n';
import { PokemonSelector } from './PokemonSelector';
import { X, Upload, FileText, Sparkles, Loader2, Pencil, Image as ImageIcon, Lock } from 'lucide-react';

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
  const [nature, setNature] = useState(initialData?.nature || 'Adamant');
  const [subskills, setSubskills] = useState(() => normalizeBoxSubskills(initialData?.subskills));
  const [ingredients, setIngredients] = useState({
    slotA: initialData?.ingredients?.slotA || 'Apple',
    slotB: initialData?.ingredients?.slotB || 'Apple',
    slotC: initialData?.ingredients?.slotC || 'Apple',
  });
  const [mainSkillLevel, setMainSkillLevel] = useState(initialData?.mainSkillLevel || 1);
  const [ribbonLevel, setRibbonLevel] = useState(initialData?.ribbonLevel || 0);

  // Transition lifecycle states
  const [shouldRender, setShouldRender] = useState(isOpen);
  const [isClosing, setIsClosing] = useState(false);

  // OCR state
  const [ocrText, setOcrText] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [ocrMessage, setOcrMessage] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

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
      setNature(initialData.nature || 'Adamant');
      setSubskills(normalizeBoxSubskills(initialData.subskills));
      setIngredients({
        slotA: initialData.ingredients?.slotA || sp.ingredient0?.[0]?.ingredient || 'Apple',
        slotB: initialData.ingredients?.slotB || sp.ingredient30?.[0]?.ingredient || 'Apple',
        slotC: initialData.ingredients?.slotC || sp.ingredient60?.[0]?.ingredient || 'Apple',
      });
      setMainSkillLevel(initialData.mainSkillLevel || 1 + (sp.previousEvolutions || 0));
      setRibbonLevel(initialData.ribbonLevel || 0);
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
  const validSlotB = useMemo(
    () => (currentSpecies.ingredient30 || []).filter((i) => i.ingredient !== 'Locked'),
    [currentSpecies]
  );
  const validSlotC = useMemo(
    () => (currentSpecies.ingredient60 || []).filter((i) => i.ingredient !== 'Locked'),
    [currentSpecies]
  );

  const handleSpeciesChange = (newSpeciesName: string) => {
    setPokemonName(newSpeciesName);
    const sp = GAME_DATA.pokemon.find(
      (p) => p.name.toUpperCase() === newSpeciesName.toUpperCase()
    );
    if (sp) {
      setIngredients({
        slotA: sp.ingredient0?.[0]?.ingredient || 'Apple',
        slotB: sp.ingredient30?.[0]?.ingredient || sp.ingredient0?.[0]?.ingredient || 'Apple',
        slotC: sp.ingredient60?.[0]?.ingredient || sp.ingredient0?.[0]?.ingredient || 'Apple',
      });
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
    setOcrMessage('正在上传并运行 RapidOCR 模型解析面板与副技能...');
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
        setOcrMessage(
          `识别成功！物种：${data.parsed.pokemon?.displayName || data.parsed.pokemon?.name || '未知'} Lv.${data.parsed.level || '?'}${rpHint}（置信度 ${(data.parsed.confidence * 100).toFixed(0)}%，已自动填入表单供核对）`
        );
      } else {
        const errData = await res.json().catch(() => null);
        setOcrMessage(errData?.detail || '后端 OCR 处理失败，请检查文件是否为有效截图及 Python 服务是否运行。');
      }
    } catch {
      setOcrMessage('无法连接到后端 OCR 服务（端口 8000），请确认后端已启动或直接粘贴文本识别。');
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
        setOcrMessage(`识别成功！匹配物种：${data.pokemon?.displayName || data.pokemon?.name}`);
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
    if (parsed.level) {
      setLevel(Math.min(70, Math.max(1, parsed.level)));
    }
    if (parsed.nature?.name) {
      setNature(parsed.nature.name);
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
      for (const s of parsed.subskills) {
        const slot =
          s.slot === 'level75' ? 'level70' : s.slot === 'level100' ? 'level80' : s.slot;
        if (slot && s.name && slot in nextSubs) {
          (nextSubs as any)[slot] = s.name;
        }
      }
      setSubskills(nextSubs);
    }
    if (parsed.ingredients && Array.isArray(parsed.ingredients)) {
      const nextIngs = {
        slotA: targetSpecies.ingredient0?.[0]?.ingredient || 'Apple',
        slotB: targetSpecies.ingredient30?.[0]?.ingredient || 'Apple',
        slotC: targetSpecies.ingredient60?.[0]?.ingredient || 'Apple',
      };
      for (const ing of parsed.ingredients) {
        if (ing.slot === 'slotA' && ing.name) nextIngs.slotA = ing.name;
        if (ing.slot === 'slotB' && ing.name) nextIngs.slotB = ing.name;
        if (ing.slot === 'slotC' && ing.name) nextIngs.slotC = ing.name;
      }
      setIngredients(nextIngs);
    }
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
    setOcrMessage('本地前端词库模糊匹配完成，请核对信息。');
    setActiveMode('manual');
  };

  const handleSave = () => {
    const newPkmn: BoxPokemon = {
      id: initialData?.id || `pkmn_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      pokemonName,
      nickname: nickname.trim() || undefined,
      level: Math.min(70, Math.max(1, level)),
      nature,
      subskills,
      ingredients,
      mainSkillLevel,
      ribbonLevel,
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
        className={`modal-panel p-6 ${isClosing ? 'animate-panel-out' : 'animate-panel-in'}`}
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
                {isEditMode ? '编辑宝可梦档案' : getUIText('addPokemon', locale)}
              </h2>
              <p className="text-[11px] text-[var(--text-muted)]">
                营地观测记录表 · Camp Slumber Journal
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
            手动填选 / 属性核对
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
            截图 / 文本 OCR 识别
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
                上传或拖拽截图 (支持简中/繁中/日文/英文)
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
                      正在运行 OCR 识别...
                    </>
                  ) : (
                    <>
                      <ImageIcon className="w-4 h-4 mr-1.5" />
                      选择截图文件
                    </>
                  )}
                  <input
                    type="file"
                    onChange={handleImageUpload}
                    className="hidden"
                  />
                </label>
                <p className="text-xs text-[var(--text-muted)] mt-2.5">
                  支持无扩展名图片或截屏，也可在此按 <kbd className="px-1.5 py-0.5 bg-white border border-[#eae4d6] rounded text-2xs shadow-2xs font-mono">Ctrl+V</kbd> 直接粘贴
                </p>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[var(--text-main)] mb-1">
                或直接粘贴 OCR 文本内容
              </label>
              <textarea
                rows={3}
                value={ocrText}
                onChange={(e) => setOcrText(e.target.value)}
                placeholder={'例如：\nLv.41 蜥蜴王\n树果遽增 Lv.3\nLv.10 技能几率提升M\nLv.25 持有上限提升S\nLv.50 树果数量S\n性格 悠闲'}
                className="input-field text-xs font-mono"
              />
              <button
                type="button"
                onClick={handleOcrTextParse}
                disabled={isScanning || !ocrText.trim()}
                className="btn btn-secondary mt-2 w-full text-xs"
              >
                <FileText className="w-3.5 h-3.5 mr-1.5" />
                解析文本并填入表单
              </button>
            </div>
          </div>
        )}

        {/* Manual Input Form */}
        {activeMode === 'manual' && (
          <div className="space-y-3.5 py-1 max-h-[62vh] overflow-y-auto px-0.5 pr-1.5">
            {/* Species Selector */}
            <div>
              <label className="block text-xs font-semibold text-[var(--text-main)] mb-1">
                宝可梦物种 (支持按专长 / 属性 / 食材 / 进化检索)
              </label>
              <PokemonSelector
                value={pokemonName}
                onChange={handleSpeciesChange}
                locale={locale}
              />
            </div>

            {/* Nickname, Level & Main Skill Level */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <div>
                <label className="block text-xs font-semibold text-[var(--text-main)] mb-1">
                  昵称 / 备注 (可选)
                </label>
                <input
                  type="text"
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  placeholder="例如：主力树果王"
                  className="input-field text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--text-main)] mb-1">
                  当前等级 (上限 Lv.70)
                </label>
                <input
                  type="number"
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
                  <span>主技能等级 (1–{maxSkillLvl})</span>
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

            {/* Nature & Ribbon */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <label className="block text-xs font-semibold text-[var(--text-main)] mb-1">
                  {getUIText('nature', locale)}
                </label>
                <select
                  value={nature}
                  onChange={(e) => setNature(e.target.value)}
                  className="input-field text-xs"
                >
                  {GAME_DATA.natures.map((n) => (
                    <option key={n.name} value={n.name}>
                      {getEntityName(n, locale)}
                      {n.positiveModifier && n.positiveModifier !== 'neutral'
                        ? ` (▲${getNatureModLabel(n.positiveModifier, locale)} ▼${getNatureModLabel(n.negativeModifier, locale)})`
                        : ' (无修正)'}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--text-main)] mb-1">
                  晚安缎带等级 (0–4 级)
                </label>
                <select
                  value={ribbonLevel}
                  onChange={(e) => setRibbonLevel(Number(e.target.value))}
                  className="input-field text-xs"
                >
                  <option value={0}>0 级 (无缎带)</option>
                  <option value={1}>1 级 (200小时：持有+1)</option>
                  <option value={2}>2 级 (500小时：持有+3, 未进化加速)</option>
                  <option value={3}>3 级 (1000小时：持有+6)</option>
                  <option value={4}>4 级 (2000小时：持有+8, 未进化二段加速)</option>
                </select>
              </div>
            </div>

            {/* Subskills Selection */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold text-[var(--text-main)]">
                  {getUIText('subskills', locale)}
                </label>
                <span className="text-[11px] text-[var(--text-muted)]">
                  开放至 Lv.70 / 当前等级 Lv.{level}
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
                      <option value="">(未设置 / 无)</option>
                      {GAME_DATA.subskills.map((s) => (
                        <option key={s.name} value={s.name}>
                          [{s.rarity === 'gold' ? '金' : s.rarity === 'silver' ? '银' : '白'}] {getEntityName(s, locale)}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>

            {/* Ingredients Selection: Pantry Tray */}
            <div>
              <label className="block text-xs font-semibold text-[var(--text-main)] mb-1.5">
                {getUIText('ingredients', locale)} (A: Lv.1 / B: Lv.30 / C: Lv.60)
              </label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: 'A 槽 (Lv.1)', key: 'slotA' as const, list: validSlotA },
                  { label: 'B 槽 (Lv.30)', key: 'slotB' as const, list: validSlotB },
                  { label: 'C 槽 (Lv.60)', key: 'slotC' as const, list: validSlotC },
                ].map(({ label, key, list }) => {
                  const selectedIng = ingredients[key];
                  return (
                    <div key={key} className="p-2.5 rounded-xl border border-[#eae4d6] bg-[#f7f5ee]">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-2xs text-[var(--text-muted)] font-semibold">{label}</span>
                        {selectedIng && (
                          <img
                            src={getIngredientImageUrl(selectedIng)}
                            alt={selectedIng}
                            className="w-4 h-4 object-contain"
                          />
                        )}
                      </div>
                      <select
                        value={selectedIng}
                        onChange={(e) => setIngredients({ ...ingredients, [key]: e.target.value })}
                        className="input-field text-xs py-1 bg-white"
                      >
                        {list.map((item) => {
                          const ingObj = GAME_DATA.ingredients.find(
                            (i) => i.name.toLowerCase() === item.ingredient.toLowerCase()
                          );
                          return (
                            <option key={item.ingredient} value={item.ingredient}>
                              {ingObj ? getEntityName(ingObj, locale) : item.ingredient} ×{item.amount}
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
            {isEditMode ? '保存修改' : getUIText('save', locale)}
          </button>
        </div>
      </div>
    </div>
  );
};
