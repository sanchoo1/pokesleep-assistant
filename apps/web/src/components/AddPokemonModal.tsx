import React, { useState, useMemo } from 'react';
import { GAME_DATA, SupportedLocale } from '@pokesleep/data';
import { BoxPokemon } from '../storage/db';
import { getEntityName, getUIText } from '../i18n';
import { X, Upload, FileText, Sparkles, Loader2 } from 'lucide-react';

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
  const [activeMode, setActiveMode] = useState<'manual' | 'ocr'>('manual');
  const [pokemonName, setPokemonName] = useState(initialData?.pokemonName || 'PIKACHU');
  const [level, setLevel] = useState(initialData?.level || 25);
  const [nature, setNature] = useState(initialData?.nature || 'Adamant');
  const [subskills, setSubskills] = useState({
    level10: initialData?.subskills?.level10 || 'Berry Finding S',
    level25: initialData?.subskills?.level25 || 'Helping Speed M',
    level50: initialData?.subskills?.level50 || '',
    level75: initialData?.subskills?.level75 || '',
    level100: initialData?.subskills?.level100 || '',
  });
  const [ingredients, setIngredients] = useState({
    slotA: initialData?.ingredients?.slotA || 'Apple',
    slotB: initialData?.ingredients?.slotB || 'Apple',
    slotC: initialData?.ingredients?.slotC || 'Apple',
  });
  const [ribbonLevel, setRibbonLevel] = useState(initialData?.ribbonLevel || 0);

  // OCR state
  const [ocrText, setOcrText] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [ocrMessage, setOcrMessage] = useState<string | null>(null);

  const currentSpecies = useMemo(() => {
    return (
      GAME_DATA.pokemon.find(
        (p) => p.name.toUpperCase() === pokemonName.toUpperCase()
      ) || GAME_DATA.pokemon[0]
    );
  }, [pokemonName]);

  // Valid ingredient choices for current Pokémon
  const validSlotA = useMemo(() => currentSpecies.ingredient0 || [], [currentSpecies]);
  const validSlotB = useMemo(() => currentSpecies.ingredient30 || [], [currentSpecies]);
  const validSlotC = useMemo(() => currentSpecies.ingredient60 || [], [currentSpecies]);

  // Update ingredient slots when species changes if current ingredient not valid
  const handleSpeciesChange = (newSpeciesName: string) => {
    setPokemonName(newSpeciesName);
    const sp = GAME_DATA.pokemon.find((p) => p.name.toUpperCase() === newSpeciesName.toUpperCase());
    if (sp) {
      if (sp.ingredient0?.[0]) setIngredients((prev) => ({ ...prev, slotA: sp.ingredient0[0].ingredient }));
      if (sp.ingredient30?.[0]) setIngredients((prev) => ({ ...prev, slotB: sp.ingredient30[0].ingredient }));
      if (sp.ingredient60?.[0]) setIngredients((prev) => ({ ...prev, slotC: sp.ingredient60[0].ingredient }));
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

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsScanning(true);
    setOcrMessage('正在上传并运行 RapidOCR 模型...');
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await fetch('/api/ocr/scan-image', {
        method: 'POST',
        body: formData,
      });
      if (res.ok) {
        const data = await res.json();
        applyOcrData(data.parsed);
        setOcrMessage(`识别成功！置信度: ${(data.parsed.confidence * 100).toFixed(0)}%`);
      } else {
        setOcrMessage('后端 OCR 处理失败，请检查 Python 微服务是否启动。');
      }
    } catch {
      setOcrMessage('无法连接到后端 OCR 服务，可尝试直接粘贴识别文字。');
    } finally {
      setIsScanning(false);
    }
  };

  const applyOcrData = (parsed: any) => {
    if (parsed.pokemon?.name) {
      handleSpeciesChange(parsed.pokemon.name);
    }
    if (parsed.level) {
      setLevel(parsed.level);
    }
    if (parsed.nature?.name) {
      setNature(parsed.nature.name);
    }
    if (parsed.subskills && Array.isArray(parsed.subskills)) {
      const newSubs = { ...subskills };
      for (const s of parsed.subskills) {
        if (s.slot && s.name) {
          (newSubs as any)[s.slot] = s.name;
        }
      }
      setSubskills(newSubs);
    }
    if (parsed.ingredients && Array.isArray(parsed.ingredients)) {
      const newIngs = { ...ingredients };
      for (const ing of parsed.ingredients) {
        if (ing.slot === 'slotA') newIngs.slotA = ing.name;
        if (ing.slot === 'slotB') newIngs.slotB = ing.name;
        if (ing.slot === 'slotC') newIngs.slotC = ing.name;
      }
      setIngredients(newIngs);
    }
    setActiveMode('manual');
  };

  const fallbackClientOcr = (text: string) => {
    // Basic client side fuzzy match fallback
    const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
    for (const l of lines) {
      const pkmn = GAME_DATA.pokemon.find(
        (p) =>
          p.name.toLowerCase().includes(l.toLowerCase()) ||
          p.displayName.toLowerCase().includes(l.toLowerCase()) ||
          (p.translations &&
            Object.values(p.translations).some((t) => t.toLowerCase().includes(l.toLowerCase())))
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
      level,
      nature,
      subskills,
      ingredients,
      ribbonLevel,
      createdAt: initialData?.createdAt || Date.now(),
    };
    onSave(newPkmn);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="modal-backdrop">
      <div className="modal-panel p-6">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-200">
          <div className="flex items-center space-x-2">
            <Sparkles className="w-5 h-5 text-blue-600" />
            <h2 className="text-lg font-bold text-slate-900">{getUIText('addPokemon', locale)}</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mode Toggle */}
        <div className="flex space-x-2 my-4">
          <button
            onClick={() => setActiveMode('manual')}
            className={`flex-1 py-2 text-sm font-semibold rounded-lg border cursor-pointer ${
              activeMode === 'manual'
                ? 'bg-blue-50 border-blue-600 text-blue-700'
                : 'border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            手动填选
          </button>
          <button
            onClick={() => setActiveMode('ocr')}
            className={`flex-1 py-2 text-sm font-semibold rounded-lg border cursor-pointer ${
              activeMode === 'ocr'
                ? 'bg-blue-50 border-blue-600 text-blue-700'
                : 'border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            截图 / 文本 OCR 识别
          </button>
        </div>

        {/* OCR Panel */}
        {activeMode === 'ocr' && (
          <div className="space-y-4 py-2">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                上传游戏详情页截图 (支持简中/繁中/日文/英文)
              </label>
              <div className="border-2 border-dashed border-slate-300 rounded-lg p-6 text-center hover:border-blue-500 transition-colors">
                <Upload className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                <label className="btn btn-secondary cursor-pointer">
                  <span>选择图片文件</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    className="hidden"
                  />
                </label>
                <p className="text-xs text-slate-500 mt-2">支持 PNG、JPEG 格式</p>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                或直接粘贴 OCR 文本内容
              </label>
              <textarea
                rows={4}
                value={ocrText}
                onChange={(e) => setOcrText(e.target.value)}
                placeholder="例如：\n皮卡丘 Lv.25\n固执的性格\nLv.10 帮手奖励\nLv.25 树果数量S"
                className="input-field text-xs font-mono"
              />
              <button
                onClick={handleOcrTextParse}
                disabled={isScanning || !ocrText.trim()}
                className="btn btn-primary mt-2 w-full"
              >
                {isScanning ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    正在分析...
                  </>
                ) : (
                  <>
                    <FileText className="w-4 h-4 mr-2" />
                    解析文本并填入表单
                  </>
                )}
              </button>
            </div>

            {ocrMessage && (
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-md text-xs text-blue-800">
                {ocrMessage}
              </div>
            )}
          </div>
        )}

        {/* Manual Input Form */}
        {activeMode === 'manual' && (
          <div className="space-y-4 py-2 max-h-[60vh] overflow-y-auto px-1">
            {/* Species */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                宝可梦物种 ({GAME_DATA.pokemon.length} 种)
              </label>
              <select
                value={pokemonName}
                onChange={(e) => handleSpeciesChange(e.target.value)}
                className="input-field"
              >
                {GAME_DATA.pokemon.map((p) => (
                  <option key={p.name} value={p.name}>
                    #{p.pokedexNumber} {getEntityName(p, locale)} ({p.specialty})
                  </option>
                ))}
              </select>
            </div>

            {/* Level & Nature */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {getUIText('level', locale)}: {level}
                </label>
                <input
                  type="number"
                  min={1}
                  max={70}
                  value={level}
                  onChange={(e) => setLevel(Math.min(70, Math.max(1, Number(e.target.value))))}
                  className="input-field"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {getUIText('nature', locale)}
                </label>
                <select
                  value={nature}
                  onChange={(e) => setNature(e.target.value)}
                  className="input-field"
                >
                  {GAME_DATA.natures.map((n) => (
                    <option key={n.name} value={n.name}>
                      {getEntityName(n, locale)}
                      {n.positiveModifier ? ` (▲${n.positiveModifier} ▼${n.negativeModifier})` : ' (中性)'}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Subskills */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-2">
                {getUIText('subskills', locale)} (5 个槽位)
              </label>
              <div className="space-y-2">
                {[
                  { lvl: 10, key: 'level10' as const },
                  { lvl: 25, key: 'level25' as const },
                  { lvl: 50, key: 'level50' as const },
                  { lvl: 75, key: 'level75' as const },
                  { lvl: 100, key: 'level100' as const },
                ].map(({ lvl, key }) => (
                  <div key={key} className="flex items-center space-x-2">
                    <span className="text-xs font-bold text-slate-500 w-16">Lv.{lvl}</span>
                    <select
                      value={subskills[key]}
                      onChange={(e) => setSubskills({ ...subskills, [key]: e.target.value })}
                      className="input-field text-xs"
                    >
                      <option value="">(未解锁 / 无)</option>
                      {GAME_DATA.subskills.map((s) => (
                        <option key={s.name} value={s.name}>
                          [{s.rarity.toUpperCase()}] {getEntityName(s, locale)}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>

            {/* Ingredients */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-2">
                {getUIText('ingredients', locale)} (A / B / C 槽位)
              </label>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <span className="block text-2xs text-slate-500 font-semibold mb-1">A (Lv.1)</span>
                  <select
                    value={ingredients.slotA}
                    onChange={(e) => setIngredients({ ...ingredients, slotA: e.target.value })}
                    className="input-field text-xs"
                  >
                    {validSlotA.map((item) => {
                      const ingObj = GAME_DATA.ingredients.find(
                        (i) => i.name.toLowerCase() === item.ingredient.toLowerCase()
                      );
                      return (
                        <option key={item.ingredient} value={item.ingredient}>
                          {ingObj ? getEntityName(ingObj, locale) : item.ingredient} x{item.amount}
                        </option>
                      );
                    })}
                  </select>
                </div>

                <div>
                  <span className="block text-2xs text-slate-500 font-semibold mb-1">B (Lv.30)</span>
                  <select
                    value={ingredients.slotB}
                    onChange={(e) => setIngredients({ ...ingredients, slotB: e.target.value })}
                    className="input-field text-xs"
                  >
                    {validSlotB.map((item) => {
                      const ingObj = GAME_DATA.ingredients.find(
                        (i) => i.name.toLowerCase() === item.ingredient.toLowerCase()
                      );
                      return (
                        <option key={item.ingredient} value={item.ingredient}>
                          {ingObj ? getEntityName(ingObj, locale) : item.ingredient} x{item.amount}
                        </option>
                      );
                    })}
                  </select>
                </div>

                <div>
                  <span className="block text-2xs text-slate-500 font-semibold mb-1">C (Lv.60)</span>
                  <select
                    value={ingredients.slotC}
                    onChange={(e) => setIngredients({ ...ingredients, slotC: e.target.value })}
                    className="input-field text-xs"
                  >
                    {validSlotC.map((item) => {
                      const ingObj = GAME_DATA.ingredients.find(
                        (i) => i.name.toLowerCase() === item.ingredient.toLowerCase()
                      );
                      return (
                        <option key={item.ingredient} value={item.ingredient}>
                          {ingObj ? getEntityName(ingObj, locale) : item.ingredient} x{item.amount}
                        </option>
                      );
                    })}
                  </select>
                </div>
              </div>
            </div>

            {/* Ribbon */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                晚安缎带等级 (0–4 级)
              </label>
              <select
                value={ribbonLevel}
                onChange={(e) => setRibbonLevel(Number(e.target.value))}
                className="input-field text-xs"
              >
                <option value={0}>0 级 (无缎带)</option>
                <option value={1}>1 级 (200小时：持有+1)</option>
                <option value={2}>2 级 (500小时：持有+3, 帮手-5%)</option>
                <option value={3}>3 级 (1000小时：持有+6, 帮手-9%)</option>
                <option value={4}>4 级 (2000小时：持有+8, 帮手-12%)</option>
              </select>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end space-x-2 pt-4 border-t border-slate-200 mt-4">
          <button onClick={onClose} className="btn btn-secondary">
            {getUIText('cancel', locale)}
          </button>
          <button onClick={handleSave} className="btn btn-primary">
            {getUIText('save', locale)}
          </button>
        </div>
      </div>
    </div>
  );
};
