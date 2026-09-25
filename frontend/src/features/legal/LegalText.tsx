// Only plain text and headings are supported; drafts cannot inject HTML or links.
export function LegalText({ body }: { body: string }) {
  const blocks: {heading: boolean; text: string}[] = [];
  let paragraph: string[] = [];
  const flush = () => {if (paragraph.length) blocks.push({heading: false, text: paragraph.join("\n")}); paragraph = [];};
  for (const line of body.split("\n")) {
    if (/^#{1,2} /.test(line)) {flush(); blocks.push({heading: true, text: line.replace(/^#{1,2} /, "")});}
    else if (!line.trim()) flush();
    else paragraph.push(line);
  }
  flush();
  return <div className="legal-copy">{blocks.map((block, index) => block.heading ? <h2 key={index}>{block.text}</h2> : <p key={index} className={block.text.includes("[PENDIENTE:") || block.text.includes("{{") ? "legal-decision" : undefined}>{block.text}</p>)}</div>;
}
