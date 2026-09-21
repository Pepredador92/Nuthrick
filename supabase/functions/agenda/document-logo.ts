import {decode,encode} from 'npm:fast-png@6.4.0';

/** A 28 mm letterhead mark does not need a multi-megapixel source image.
 * Bound decoding and retain transparency; the original private asset is untouched.
 */
export function letterheadPng(bytes:Uint8Array):Uint8Array {
  if(bytes.length<24)throw new Error('invalid_logo');
  const header=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  const w=header.getUint32(16),h=header.getUint32(20);
  if(!w||!h||w*h>16_000_000)throw new Error('invalid_logo');
  if(Math.max(w,h)<=384)return bytes;
  const source=decode(bytes),scale=Math.min(384/w,384/h);
  const width=Math.max(1,Math.round(w*scale)),height=Math.max(1,Math.round(h*scale));
  const data=new Uint8Array(width*height*4),factor=255/(2**source.depth-1);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const at=(Math.min(h-1,Math.floor((y+.5)/scale))*w+Math.min(w-1,Math.floor((x+.5)/scale)))*source.channels;
    const out=(y*width+x)*4,p=source.palette?.[source.data[at]];
    if(p){data.set([p[0],p[1],p[2],p[3]??255],out);continue;}
    const c=(offset:number)=>Math.round(source.data[at+offset]*factor);
    if(source.channels<3)data.set([c(0),c(0),c(0),source.channels===2?c(1):255],out);
    else data.set([c(0),c(1),c(2),source.channels===4?c(3):255],out);
  }
  return encode({width,height,data,channels:4,depth:8});
}
