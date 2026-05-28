import React from 'react';
import { Percent, Sparkles, AlertTriangle, CheckCircle, Info } from 'lucide-react';
import { parsePercentageRate, calculateCommission } from '../../lib/commissionMapping';

// --------------------------------------------------
// 1. CommissionRateInput
// --------------------------------------------------
interface CommissionRateInputProps {
  label: string;
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  accentColor: 'secondary' | 'primary' | 'primary';
  disabled?: boolean;
}

export function CommissionRateInput({
  label,
  value,
  onChange,
  placeholder = "0.0",
  accentColor,
  disabled = false
}: CommissionRateInputProps) {
  const parsed = parsePercentageRate(value);
  const isDecimalFractionPattern = parsed > 0 && parsed <= 0.05;

  const colorConfig = {
    secondary: {
      border: 'border-secondary-200 focus-within:ring-secondary-500/20 focus-within:border-secondary-500',
      bg: 'bg-secondary-50/35',
      text: 'text-secondary-700',
      badge: 'bg-secondary-50 text-secondary-705 border-secondary-100',
    },
    primary: {
      border: 'border-primary-200 focus-within:ring-primary-500/20 focus-within:border-primary-500',
      bg: 'bg-primary-50/35',
      text: 'text-primary-700',
      badge: 'bg-primary-50 text-primary-705 border-primary-100',
    }
  }[accentColor];

  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-extrabold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
        {label} <span className="text-rose-500">*</span>
      </label>
      <div className={`relative flex items-center rounded-lg border bg-white dark:bg-gray-900 transition-all overflow-hidden ${colorConfig.border} ${disabled ? 'opacity-60 bg-gray-50 dark:bg-gray-800/50' : ''}`}>
        <input
          type="text"
          disabled={disabled}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={`w-full px-3 py-2 text-sm font-extrabold outline-none bg-transparent ${colorConfig.text} placeholder-gray-400`}
        />
        <div className={`flex items-center gap-1 px-3 py-1 bg-gray-50 dark:bg-gray-800/50 border-l border-gray-150 h-full text-xs font-bold text-gray-500`}>
          <Percent className="w-3.5 h-3.5" />
        </div>
      </div>
      {isDecimalFractionPattern && (
        <p className="text-[10px] text-amber-600 font-bold flex items-center gap-1">
          <AlertTriangle className="w-3 h-3 shrink-0" />
          ระวัง: กรอก {parsed * 100} แทนทศนิยมดั้งเดิม {parsed}
        </p>
      )}
    </div>
  );
}

// --------------------------------------------------
// 2. CommissionPreviewCard
// --------------------------------------------------
interface CommissionPreviewCardProps {
  commissionRate9: string | number;
  commissionRate68: string | number;
  shippingAmount?: number;
}

export function CommissionPreviewCard({
  commissionRate9,
  commissionRate68,
  shippingAmount = 1000
}: CommissionPreviewCardProps) {
  const r9 = parsePercentageRate(commissionRate9);
  const r68 = parsePercentageRate(commissionRate68);

  const calcR9Net = calculateCommission(shippingAmount, r9);
  const calcR68Net = calculateCommission(shippingAmount, r68);

  const isNumeric9 = !isNaN(Number(commissionRate9)) && commissionRate9 !== '';
  const isNumeric68 = !isNaN(Number(commissionRate68)) && commissionRate68 !== '';

  return (
    <div className="bg-primary-50/50 p-4 rounded-xl border border-primary-100 space-y-2.5 shadow-sm text-xs">
      <div className="flex items-center gap-1.5 text-gray-700 dark:text-gray-300 font-extrabold">
        <Sparkles className="w-4 h-4 text-primary-600 animate-pulse" />
        <span>ตารางสาธิตสูตรคำนวณเบื้องต้น (เปอร์เซ็นต์ตรง):</span>
      </div>
      
      <div className="space-y-1.5 font-semibold text-gray-600 dark:text-gray-400">
        <div>
          สูตรคำนวณมาตรฐาน: <span className="font-mono font-bold text-gray-800 dark:text-gray-200">ยอดเงินหลัก × (เรต % / 100)</span>
        </div>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
          <div className="bg-white dark:bg-gray-900 p-2 rounded-lg border border-gray-100 flex items-center justify-between">
            <div>
              <span className="block text-[10px] text-gray-400">9 จังหวัด (เรต {r9}%)</span>
              <span className="font-mono font-bold text-gray-700 dark:text-gray-300">ยอด {shippingAmount.toLocaleString()} บ.</span>
            </div>
            <span className="text-sm font-black font-mono text-secondary-600">
              {isNumeric9 ? `+${calcR9Net.toFixed(2)} บ.` : '-'}
            </span>
          </div>

          <div className="bg-white dark:bg-gray-900 p-2 rounded-lg border border-gray-100 flex items-center justify-between">
            <div>
              <span className="block text-[10px] text-gray-400">68 จังหวัด (เรต {r68}%)</span>
              <span className="font-mono font-bold text-gray-700 dark:text-gray-300">ยอด {shippingAmount.toLocaleString()} บ.</span>
            </div>
            <span className="text-sm font-black font-mono text-primary-600">
              {isNumeric68 ? `+${calcR68Net.toFixed(2)} บ.` : '-'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// --------------------------------------------------
// 3. MappingValidation
// --------------------------------------------------
interface MappingValidationProps {
  commissionRate9: string | number;
  commissionRate68: string | number;
}

export function MappingValidation({
  commissionRate9,
  commissionRate68
}: MappingValidationProps) {
  const r9Raw = String(commissionRate9).trim();
  const r68Raw = String(commissionRate68).trim();

  const r9Num = Number(r9Raw);
  const r68Num = Number(r68Raw);

  const isR9ValidNumber = r9Raw !== '' && !isNaN(r9Num);
  const isR68ValidNumber = r68Raw !== '' && !isNaN(r68Num);

  const errors: string[] = [];
  const warnings: string[] = [];

  // Check rate 9
  if (r9Raw === '') {
    errors.push('กรุณาระบุเรตค่าแนะนำ 9 จังหวัด');
  } else if (!isR9ValidNumber) {
    errors.push('เรตค่าแนะนำ 9 จังหวัด ต้องเป็นตัวเลข');
  } else {
    if (r9Num < 0 || r9Num > 100) {
      errors.push('เรตค่าแนะนำ 9 จังหวัด ต้องมีค่าอยู่ระหว่าง 0% ถึง 100%');
    }
    if (r9Num > 0 && r9Num <= 0.05) {
      warnings.push(`เรต 9 จังหวัด มีค่าเป็น ${r9Num} ซึ่งมองว่าเป็นรูปแบบทศนิยมเก่า (เช่น 0.006) กรุณาระดับเปอร์เซ็นต์จริง (เช่น 0.6%)`);
    }
  }

  // Check rate 68
  if (r68Raw === '') {
    errors.push('กรุณาระบุเรตค่าแนะนำ 68 จังหวัด');
  } else if (!isR68ValidNumber) {
    errors.push('เรตค่าแนะนำ 68 จังหวัด ต้องเป็นตัวเลข');
  } else {
    if (r68Num < 0 || r68Num > 100) {
      errors.push('เรตค่าแนะนำ 68 จังหวัด ต้องมีค่าอยู่ระหว่าง 0% ถึง 100%');
    }
    if (r68Num > 0 && r68Num <= 0.05) {
      warnings.push(`เรต 68 จังหวัด มีค่าเป็น ${r68Num} ซึ่งมองว่าเป็นรูปแบบทศนิยมเก่า (เช่น 0.006) กรุณาระดับเปอร์เซ็นต์จริง (เช่น 0.6%)`);
    }
  }

  if (errors.length === 0 && warnings.length === 0) {
    return (
      <div className="bg-secondary-50/40 p-3 rounded-lg border border-secondary-100 flex items-start gap-2.5 text-[11px] text-secondary-800">
        <CheckCircle className="w-4 h-4 text-secondary-600 shrink-0 mt-0.5" />
        <div>
          <span className="font-extrabold">ตรวจสอบผ่านการตรวจสอบ:</span>
          <p className="text-gray-500 mt-0.5 font-medium">ค่าแนะนำทั้ง 9 จังหวัด และ 68 จังหวัดผ่านเกณฑ์เปอร์เซ็นต์ตรงสมบูรณ์</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {errors.length > 0 && (
        <div className="bg-rose-50/55 p-3 rounded-lg border border-rose-100 flex items-start gap-2.5 text-[11px] text-rose-800">
          <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5 animate-bounce" />
          <div>
            <span className="font-extrabold text-rose-900">ข้อตกลงรูปแบบไม่ถูกต้อง ({errors.length}):</span>
            <ul className="list-disc pl-4 mt-1 font-medium space-y-0.5 text-rose-700">
              {errors.map((err, i) => <li key={i}>{err}</li>)}
            </ul>
          </div>
        </div>
      )}

      {warnings.length > 0 && (
        <div className="bg-amber-50/50 p-3 rounded-lg border border-amber-100 flex items-start gap-2.5 text-[11px] text-amber-800">
          <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <span className="font-extrabold text-amber-900">คำเตือนระบบตรวจสอบ ({warnings.length}):</span>
            <ul className="list-disc pl-4 mt-1 font-medium space-y-0.5 text-amber-700">
              {warnings.map((warn, i) => <li key={i}>{warn}</li>)}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
