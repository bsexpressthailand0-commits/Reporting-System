import React from 'react';
import { createRoot } from 'react-dom/client';
import { toPng, toJpeg } from 'html-to-image';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { formatNumber, formatCurrency, calculateReportSummary } from './utils';
import ReportExportTemplate from '../components/ReportExportTemplate';

export interface ImageExportOptions {
  reportName: string;
  displayGroupLabel: string;
  startDate: string;
  endDate: string;
  data: any[];
  companyInfo?: any;
  quality: 1 | 2; // 1x or 2x
  format: 'png' | 'jpg';
}

const ITEMS_PER_IMAGE_PAGE = 30; // Adjust to prevent images from becoming too tall

export async function exportReportToImageChunks(options: ImageExportOptions, onProgress?: (loading: boolean, text: string) => void): Promise<Blob[]> {
  const { reportName, displayGroupLabel, startDate, endDate, data, companyInfo, quality, format } = options;
  
  if (onProgress) onProgress(true, `เตรียมข้อมูลภาพ ${reportName}...`);

  // Split data into chunks
  const chunks: any[][] = [];
  if (data.length === 0) {
    chunks.push([]);
  } else {
    for (let i = 0; i < data.length; i += ITEMS_PER_IMAGE_PAGE) {
      chunks.push(data.slice(i, i + ITEMS_PER_IMAGE_PAGE));
    }
  }

  const images: Blob[] = [];

  // Container to render hidden UI
  const container = document.createElement('div');
  container.style.position = 'fixed';
  container.style.top = '-9999px';
  container.style.left = '-9999px';
  // A4 size proportions roughly (landscape is 297mm x 210mm)
  container.style.width = '1120px'; 
  container.style.minHeight = '790px';
  container.style.backgroundColor = '#ffffff';
  document.body.appendChild(container);

  const root = createRoot(container);

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];

    if (onProgress) onProgress(true, `กำลังจับภาพ ${reportName}... (หน้า ${i + 1}/${chunks.length})`);

    // Render chunk synchronously by waiting via Promise
    await new Promise<void>(resolve => {
      root.render(
        <div id="export-image-node" className="p-8 bg-white" style={{ width: '1120px', minHeight: '790px', backgroundColor: '#fff' }}>
          <ReportExportTemplate 
            reportName={reportName}
            displayGroupLabel={displayGroupLabel}
            startDate={startDate}
            endDate={endDate}
            data={chunk}
            companyInfo={companyInfo}
            page={{ current: i + 1, total: chunks.length }}
          />
        </div>
      );
      // Wait for rendering to settle
      setTimeout(resolve, 300);
    });

    const node = document.getElementById('export-image-node');
    if (node) {
      const opts = { 
         quality: 1, 
         pixelRatio: quality,
         backgroundColor: '#ffffff'
      };
      
      let blob: Blob | null;
      if (format === 'jpg') {
         blob = await toJpeg(node, opts).then(dataUrl => fetch(dataUrl).then(res => res.blob()));
      } else {
         blob = await toPng(node, opts).then(dataUrl => fetch(dataUrl).then(res => res.blob()));
      }
      
      if (blob) images.push(blob);
    }
  }

  // Cleanup
  root.unmount();
  document.body.removeChild(container);

  if (onProgress) onProgress(false, '');

  return images;
}

export async function downloadReportImages(options: ImageExportOptions, onProgress?: (loading: boolean, text: string) => void) {
  try {
    const images = await exportReportToImageChunks(options, onProgress);
    const dateStr = options.startDate === options.endDate ? options.startDate : `${options.startDate}_${options.endDate}`;
    
    if (images.length === 1) {
      saveAs(images[0], `report-center_${options.reportName}_${dateStr}.${options.format}`);
    } else {
      const zip = new JSZip();
      images.forEach((blob, idx) => {
        zip.file(`report-center_${options.reportName}_${dateStr}_page${idx + 1}.${options.format}`, blob);
      });
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      saveAs(zipBlob, `report-center_${options.reportName}_${dateStr}.zip`);
    }
  } catch (err) {
    console.error('Download report images failed:', err);
    throw err;
  }
}

export async function downloadAllReportImages(
  reportsData: { reportName: string; options: ImageExportOptions }[], 
  dateStr: string,
  onProgress?: (loading: boolean, text: string) => void
) {
  try {
    const zip = new JSZip();
    let index = 1;
    for (const report of reportsData) {
      if (onProgress) onProgress(true, `กำลังสร้างภาพ ${report.reportName} (${index}/${reportsData.length})...`);
      const images = await exportReportToImageChunks(report.options, undefined); // We manage progress at top level
      images.forEach((blob, idx) => {
        const suffix = images.length > 1 ? `_page${idx + 1}` : '';
        zip.file(`report-center_${report.reportName}_${dateStr}${suffix}.${report.options.format}`, blob);
      });
      index++;
    }
    
    if (onProgress) onProgress(true, 'กำลังบีบอัดไฟล์ ZIP...');
    const zipBlob = await zip.generateAsync({ type: 'blob' });
    saveAs(zipBlob, `report-center_all_${dateStr}.zip`);
    if (onProgress) onProgress(false, '');
  } catch (err) {
    console.error('Download all report images failed:', err);
    throw err;
  }
}

