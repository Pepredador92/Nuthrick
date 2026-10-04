import {mergeConfig} from 'vite';
import base from './vite.config';
export default mergeConfig(base,{define:{'process.env':{}},server:{port:4198,strictPort:true}});
