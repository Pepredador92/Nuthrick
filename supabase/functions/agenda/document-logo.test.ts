import {decode,encode} from 'npm:fast-png@6.4.0';
import {letterheadPng} from './document-logo.ts';
const assert=(value:boolean)=>{if(!value)throw new Error('Logo assertion failed');};
Deno.test('large private PNG becomes a bounded transparent letterhead image',()=>{
 const data=new Uint8Array(768*512*4);for(let i=0;i<data.length;i+=4)data.set([23,61,54,128],i);
 const original=encode({width:768,height:512,data,channels:4});
 const result=decode(letterheadPng(original));
 assert(result.width===384&&result.height===256&&result.channels===4);
 assert(result.data[0]===23&&result.data[3]===128);
 assert(decode(original).width===768);
});
Deno.test('small logos stay unchanged and extreme dimensions are rejected before decoding',()=>{
 const small=encode({width:1,height:1,data:new Uint8Array([0,0,0,255]),channels:4});
 assert(letterheadPng(small)===small);
 const oversized=small.slice();new DataView(oversized.buffer).setUint32(16,20_000_000);
 let rejected=false;try{letterheadPng(oversized);}catch{rejected=true;}assert(rejected);
});
