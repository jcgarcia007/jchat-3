const {createRequire}=require('module');const r=createRequire('/Users/jcgarcia/Projects/JchatVer3.0/web/package.json');const sharp=r('sharp');
async function mk(w,h,label,orient,file){
  const noise=Buffer.alloc(w*h*3);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=(y*w+x)*3;noise[i]=(x*255/w+(Math.random()*40))%256;noise[i+1]=(y*255/h+(Math.random()*40))%256;noise[i+2]=Math.random()*255;}
  const svg=Buffer.from(`<svg width="${w}" height="${h}"><rect x="0" y="0" width="${w}" height="${Math.round(h*0.12)}" fill="red"/><text x="${Math.round(w*0.05)}" y="${Math.round(h*0.1)}" font-size="${Math.round(h*0.09)}" fill="white">${label}</text></svg>`);
  let img=sharp(noise,{raw:{width:w,height:h,channels:3}}).composite([{input:svg}]).jpeg({quality:92});
  if(orient) img=img.withMetadata({orientation:orient});
  await img.toFile(file);
}
(async()=>{
 await mk(4032,3024,'QA-VERT-TOP',6,'./qa_vertical_exif6.jpg');
 await mk(4032,3024,'QA-LAND',0,'./qa_landscape.jpg');
 await mk(3000,3000,'QA-SQ',0,'./qa_square.jpg');
 console.log('ok');
})().catch(e=>console.error('ERR',e.message));
