import React from 'react';
import { createRoot } from 'react-dom/client';
import { jsPDF } from 'jspdf';
import { toPng, toJpeg } from 'html-to-image';
import { saveAs } from 'file-saver';
import dayjs from 'dayjs';
import PerformanceCompareExportTemplate, { PerformanceCompareExportTemplateProps } from '../components/PerformanceCompareExportTemplate';

export interface PerformanceExportOptions extends PerformanceCompareExportTemplateProps {
  format: 'pdf' | 'png' | 'jpg';
  onProgressChange?: (loading: boolean, text: string) => void;
}

export async function exportPerformanceCompare(options: PerformanceExportOptions) {
  const { format, onProgressChange, ...templateProps } = options;
  
  if (onProgressChange) {
    onProgressChange(true, `กำลังจัดเตรียมข้อมูลสำหรับการ Export ${format.toUpperCase()}...`);
  }

  // Create temporary container
  const container = document.createElement('div');
  container.style.position = 'fixed';
  container.style.top = '-9999px';
  container.style.left = '-9999px';
  container.style.width = '1060px'; // Matching template design
  container.style.backgroundColor = '#ffffff';
  document.body.appendChild(container);

  try {
    const root = createRoot(container);

    if (onProgressChange) {
      onProgressChange(true, 'กำลังเรนเดอร์เอกสารและจัดทำสถิติข้ามช่วงเวลา...');
    }

    // Render the React component inside the container
    await new Promise<void>((resolve) => {
      root.render(
        <div id="export-perf-node" className="bg-white p-4">
          <PerformanceCompareExportTemplate {...templateProps} />
        </div>
      );
      // Wait for rendering and Recharts animations to settle down
      setTimeout(resolve, 800);
    });

    const node = document.getElementById('export-perf-node');
    if (!node) {
      throw new Error('Export target container not found');
    }

    const todayStr = dayjs().format('YYYY-MM-DD');
    const filenameBase = `performance-compare-${todayStr}`;

    if (format === 'pdf') {
      if (onProgressChange) {
        onProgressChange(true, 'กำลังจับภาพและประมวลผลความคมชัดสูงเป็น PDF...');
      }

      // Capture as high quality PNG (pixelRatio: 2 for sharp vector text)
      const dataUrl = await toPng(node, { 
        quality: 1, 
        pixelRatio: 2, 
        backgroundColor: '#ffffff' 
      });

      // Construct A4 PDF landscape (297mm x 210mm)
      const doc = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: 'a4'
      });

      const pdfWidth = doc.internal.pageSize.getWidth(); // 297
      const pdfHeight = (node.offsetHeight * pdfWidth) / node.offsetWidth;

      doc.addImage(dataUrl, 'PNG', 0, 0, pdfWidth, pdfHeight);
      doc.save(`${filenameBase}.pdf`);

    } else {
      if (onProgressChange) {
        onProgressChange(true, `กำลังบันทึกหน้าจอเป็นรูปภาพ ${format.toUpperCase()}...`);
      }

      const opts = { 
        quality: 1, 
        pixelRatio: 2, 
        backgroundColor: '#ffffff' 
      };

      if (format === 'jpg') {
        const dataUrl = await toJpeg(node, opts);
        const blob = await fetch(dataUrl).then((res) => res.blob());
        saveAs(blob, `${filenameBase}.jpg`);
      } else {
        const dataUrl = await toPng(node, opts);
        const blob = await fetch(dataUrl).then((res) => res.blob());
        saveAs(blob, `${filenameBase}.png`);
      }
    }

    // Clean up
    root.unmount();
    document.body.removeChild(container);

    if (onProgressChange) {
      onProgressChange(false, '');
    }
  } catch (error) {
    console.error('Performance Export Error:', error);
    // Cleanup on failure
    try {
      document.body.removeChild(container);
    } catch (_) {}
    
    if (onProgressChange) {
      onProgressChange(false, '');
    }
    throw error;
  }
}
