import { jsPDF } from 'jspdf';
import { toPng } from 'html-to-image';
import { createRoot } from 'react-dom/client';
import dayjs from 'dayjs';
import React from 'react';
import ReportExportTemplate from '../components/ReportExportTemplate';

export interface ExportPdfOptions {
  reportName: string;
  displayGroupLabel: string;
  startDate: string;
  endDate: string;
  data: any[];
  companyInfo?: any;
  exportScope: 'all' | 'current';
  currentPage: number;
  itemsPerPage: number;
}

const ITEMS_PER_PDF_PAGE = 30;

export async function exportReportToPdf(options: ExportPdfOptions, onProgressChange?: (loading: boolean, text: string) => void) {
  if (onProgressChange) onProgressChange(true, 'กำลังสร้างไฟล์ PDF ด้วย Template ใหม่...');

  const {
    reportName,
    displayGroupLabel,
    startDate,
    endDate,
    data,
    companyInfo,
    exportScope,
    currentPage,
    itemsPerPage
  } = options;

  let finalData = [...data];
  if (exportScope === 'current') {
    const startIndex = (currentPage - 1) * itemsPerPage;
    finalData = finalData.slice(startIndex, startIndex + itemsPerPage);
  }

  // Split data into pages
  const chunks: any[][] = [];
  if (finalData.length === 0) {
    chunks.push([]);
  } else {
    for (let i = 0; i < finalData.length; i += ITEMS_PER_PDF_PAGE) {
      chunks.push(finalData.slice(i, i + ITEMS_PER_PDF_PAGE));
    }
  }

  // A4 landscape sizing (297 x 210 mm)
  // 1200px / 297mm approx
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4'
  });

  const container = document.createElement('div');
  container.style.position = 'fixed';
  container.style.top = '-9999px';
  container.style.left = '-9999px';
  // A4 Landscape fixed pixel aspect ratio matching
  container.style.width = '1120px'; 
  container.style.minHeight = '790px';
  container.style.backgroundColor = '#ffffff';
  document.body.appendChild(container);

  const root = createRoot(container);

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      if (onProgressChange) onProgressChange(true, `กำลังสร้าง PDF หน้า ${i + 1} จาก ${chunks.length}...`);

      await new Promise<void>(resolve => {
      root.render(
        <div id="export-pdf-node" className="p-8 bg-white" style={{ width: '1120px', minHeight: '790px', backgroundColor: '#fff' }}>
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
      setTimeout(resolve, 300);
    });

    const node = document.getElementById('export-pdf-node');
    if (node) {
      const dataUrl = await toPng(node, { quality: 1, pixelRatio: 2, backgroundColor: '#ffffff' });
      
      if (i > 0) doc.addPage();
      
      // Calculate aspect ratio dimensions:
      // A4 landscape: 297 x 210 mm
      const pdfWidth = doc.internal.pageSize.getWidth();
      const pdfHeight = (node.offsetHeight * pdfWidth) / node.offsetWidth;
      
      doc.addImage(dataUrl, 'PNG', 0, 0, pdfWidth, pdfHeight);
    }
  }

  root.unmount();
  document.body.removeChild(container);

  const formattedReportName = reportName.replace(/\s+/g, '');
  const timestamp = dayjs().format('YYYYMMDD_HHmm');
  const filename = `${formattedReportName}_${timestamp}.pdf`;

  doc.save(filename);
  if (onProgressChange) onProgressChange(false, '');
}

