import React from 'react';
import { ImagePlus } from 'lucide-react';
import { checkPaste, getCrop, useCrop } from '../../services/cropStore';
import type { CropImage } from '../../services/imageCompress';

interface PasteCropButtonProps {
  onInsert: (img: CropImage) => void;
  className?: string;
  /** エディターのフォーカスを外さないために、押した瞬間のフォーカス移動を止める */
  keepFocus?: boolean;
}

/** PDFで切り抜いた画像を、いま編集している場所に貼り付けるボタン */
export const PasteCropButton: React.FC<PasteCropButtonProps> = ({ onInsert, className, keepFocus }) => {
  const crop = useCrop();

  const handle = () => {
    const img = getCrop();
    if (!img) return;
    const check = checkPaste(img);
    if (!check.ok) {
      window.alert(check.reason);
      return;
    }
    onInsert(img);
    if (check.warn) window.alert(check.warn);
  };

  return (
    <button
      type="button"
      disabled={!crop}
      onMouseDown={keepFocus ? (e) => e.preventDefault() : undefined}
      onClick={handle}
      title={
        crop
          ? `PDFで切り抜いた画像(${crop.width}×${crop.height}px・約${Math.round(crop.bytes / 1024)}KB)を、ここに貼り付けます`
          : 'PDFの「切り抜き」で範囲を選ぶと、ここから貼り付けられます'
      }
      className={
        className ??
        'flex items-center gap-1 px-1.5 py-1 rounded-md text-[11px] cursor-pointer disabled:opacity-30 text-sky-300 hover:bg-slate-700'
      }
    >
      <ImagePlus className="w-4 h-4" />
      切り抜きを貼り付け{crop ? `(${Math.round(crop.bytes / 1024)}KB)` : ''}
    </button>
  );
};

export type ImageAlign = 'block' | 'left' | 'right';

interface ImageSizeButtonsProps {
  current: number | null; // 選択中の画像の表示サイズ(%)。画像が選ばれていなければ null
  onChange: (pct: number) => void;
  align?: ImageAlign;
  onAlignChange?: (a: ImageAlign) => void;
  keepFocus?: boolean;
}

const SIZES = [25, 50, 75, 100];
const ALIGNS: Array<[ImageAlign, string, string]> = [
  ['block', '単独', '画像を1行に置く(文章は画像の下)'],
  ['left', '左寄せ', '画像を左に寄せ、右側に文章を回り込ませる'],
  ['right', '右寄せ', '画像を右に寄せ、左側に文章を回り込ませる'],
];

/** 選択中の画像の、表示サイズ(本文の幅に対する%)と配置(単独 / 左寄せ / 右寄せ)を変える */
export const ImageSizeButtons: React.FC<ImageSizeButtonsProps> = ({ current, onChange, align = 'block', onAlignChange, keepFocus }) => {
  if (current === null) return null;
  const keep = keepFocus ? (e: React.MouseEvent) => e.preventDefault() : undefined;
  const btn = (on: boolean) =>
    `px-1.5 py-0.5 rounded text-[10px] cursor-pointer ${on ? 'bg-sky-600 text-white' : 'text-slate-300 hover:bg-slate-700'}`;
  return (
    <span className="flex flex-wrap items-center gap-0.5 ml-1" aria-label="画像の大きさと配置">
      <span className="text-[10px] text-slate-400 mr-0.5">画像の大きさ</span>
      {SIZES.map((p) => (
        <button key={p} type="button" onMouseDown={keep} onClick={() => onChange(p)} className={btn(current === p)}>
          {p}%
        </button>
      ))}
      {onAlignChange && (
        <>
          <span className="text-[10px] text-slate-400 mx-0.5 ml-1.5">配置</span>
          {ALIGNS.map(([a, label, title]) => (
            <button key={a} type="button" title={title} onMouseDown={keep} onClick={() => onAlignChange(a)} className={btn(align === a)}>
              {label}
            </button>
          ))}
        </>
      )}
    </span>
  );
};
