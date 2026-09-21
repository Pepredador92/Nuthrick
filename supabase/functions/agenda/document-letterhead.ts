import type { jsPDF } from "jspdf";
export interface ProfessionalDocumentInfo {
 fullName:string; professionalTitle?:string|null;licenseNumber?:string|null;businessName?:string|null;businessAddress?:string|null;contactLines?:string[];logoUrl?:string|null;
}
/** Shared letterhead used by consultation and published-plan documents. */
export function drawProfessionalHeader(pdf:jsPDF,professional:ProfessionalDocumentInfo,logo:string|null,compact=false,compression:'FAST'|'NONE'='FAST'):number {
 const margin=16,pageWidth=pdf.internal.pageSize.getWidth(); let cursor=18;

    const brand =
      professional.businessName?.trim() ||
      professional.fullName.trim() ||
      "Nuthrick";
    const width = pageWidth - margin * 2;
    pdf.setFillColor(23, 61, 54);
    pdf.rect(0, 0, pageWidth, 2, "F");
    pdf.setFillColor(205, 161, 96);
    pdf.rect(margin, 2, 28, 1.2, "F");

    if (compact) {
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(10);
      const lines = pdf.splitTextToSize(brand, width) as string[];
      pdf.setTextColor(23, 61, 54);
      pdf.text(lines, margin, 12);
      cursor = 14 + lines.length * 4;
      pdf.setDrawColor(220, 229, 223);
      pdf.line(margin, cursor, pageWidth - margin, cursor);
      cursor += 10;
      return cursor;
    }

    const textWidth = width - (logo ? 38 : 0);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(7.5);
    pdf.setTextColor(140, 103, 53);
    pdf.text("NUTRICIÓN Y BIENESTAR", margin, 13);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(21);
    const brandLines = pdf.splitTextToSize(brand, textWidth) as string[];
    pdf.setTextColor(23, 61, 54);
    pdf.text(brandLines, margin, 23, { lineHeightFactor: 1.12 });
    let identityY = 23 + brandLines.length * 8.3 + 2;

    if (logo) {
      try {
        // PNG dimensions live in IHDR. Avoid decoding a large PNG twice
        // (getImageProperties and addImage), especially in the Edge runtime.
        const pngHeader=logo.startsWith('data:image/png;base64,')?atob(logo.split(',')[1].slice(0,44)):null;
        const dimension=(at:number)=>pngHeader!.charCodeAt(at)*16777216+pngHeader!.charCodeAt(at+1)*65536+pngHeader!.charCodeAt(at+2)*256+pngHeader!.charCodeAt(at+3);
        const properties=pngHeader&&pngHeader.length>=24?{width:dimension(16),height:dimension(20),fileType:'PNG'}:pdf.getImageProperties(logo);
        const scale = Math.min(28 / properties.width, 28 / properties.height);
        const width = properties.width * scale;
        const height = properties.height * scale;
        pdf.addImage(
          logo,
          properties.fileType,
          pageWidth - margin - 28 + (28 - width) / 2,
          12 + (28 - height) / 2,
          width,
          height,
          undefined,
          compression,
        );
      } catch {
        // The professional identity remains readable if an optional image is unavailable.
      }
    }

    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(10.5);
    const nameLines = pdf.splitTextToSize(
      professional.fullName,
      textWidth,
    ) as string[];
    pdf.text(nameLines, margin, identityY);
    identityY += nameLines.length * 4.6 + 1;
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8.5);
    pdf.setTextColor(93, 112, 103);
    const credentials = [
      professional.professionalTitle?.trim(),
      professional.licenseNumber
        ? `Cédula profesional ${professional.licenseNumber}`
        : null,
    ]
      .filter(Boolean)
      .join("  ·  ");
    if (credentials) {
      const lines = pdf.splitTextToSize(credentials, textWidth) as string[];
      pdf.text(lines, margin, identityY);
      identityY += lines.length * 4 + 2;
    }

    const contactLines = [
      professional.businessAddress,
      ...(professional.contactLines ?? []),
    ]
      .filter((line): line is string => Boolean(line?.trim()))
      .flatMap((line) => pdf.splitTextToSize(line, width - 10) as string[]);
    cursor = Math.max(logo ? 46 : 0, identityY + 3);
    if (contactLines.length) {
      const height = contactLines.length * 3.8 + 8;
      pdf.setFillColor(243, 247, 244);
      pdf.roundedRect(margin, cursor, width, height, 2, 2, "F");
      pdf.setTextColor(81, 105, 94);
      pdf.setFontSize(8);
      pdf.text(contactLines, margin + 5, cursor + 5.5, {
        lineHeightFactor: 1.34,
      });
      cursor += height + 10;
    } else {
      pdf.setDrawColor(220, 229, 223);
      pdf.line(margin, cursor, pageWidth - margin, cursor);
      cursor += 10;
    }
 return cursor;
}
export function drawPrivateFooters(pdf:jsPDF) {
 const count=pdf.getNumberOfPages(),width=pdf.internal.pageSize.getWidth(),height=pdf.internal.pageSize.getHeight();
 for(let page=1;page<=count;page++){
  pdf.setPage(page);pdf.setDrawColor(218,228,221);pdf.line(16,height-12,width-16,height-12);pdf.setFont("helvetica","normal");pdf.setFontSize(7.5);pdf.setTextColor(111,128,120);
  pdf.text("Documento privado · Información clínica confidencial",16,height-7);
  pdf.text(`Página ${page} de ${count}`,width-16,height-7,{align:"right"});
 }
}
