import {mergeConfig} from 'vite';
import base from './vite.config';
// Transparent local proxy, not fixtures or intercepted API responses.
export default mergeConfig(base,{server:{host:'127.0.0.1',port:4196,strictPort:true,proxy:{
 '/backend/functions/v1/ai':{target:'http://127.0.0.1:54330',rewrite:()=>'/functions/v1/ai'},
 '/backend':{target:'http://127.0.0.1:54321',rewrite:(path:string)=>path.replace(/^\/backend/,'')},
}}});
