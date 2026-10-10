// Zero-dependency ZIP creator for a small, static, admin-authorized Windows
// connector download. No credentials, node_modules, profiles, or user data.
const crcTable=new Uint32Array(256);
for(let n=0;n<256;n++){
  let x=n;for(let i=0;i<8;i++)x=(x&1)?(0xedb88320^(x>>>1)):(x>>>1);
  crcTable[n]=x>>>0;
}
function crc32(bytes){
  let crc=0xffffffff;
  for(const byte of bytes)crc=crcTable[(crc^byte)&255]^(crc>>>8);
  return (crc^0xffffffff)>>>0;
}
export function zipStored(files){
  const locals=[],centrals=[];
  let pos=0;
  for(const {name,bytes} of files){
    if(typeof name!=='string'||!/^[\w.-][\w./-]{0,150}$/.test(name)||name.includes('..')||name.startsWith('/'))throw Error('UNSAFE_ZIP_ENTRY');
    const file=Buffer.isBuffer(bytes)?bytes:Buffer.from(bytes);
    if(file.length>2**26)throw Error('ZIP_ENTRY_TOO_LARGE');
    const filename=Buffer.from(name,'utf8'),crc=crc32(file);
    const local=Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50,0);
    local.writeUInt16LE(20,4);
    local.writeUInt16LE(0x0800,6); // UTF8 filename
    local.writeUInt16LE(0,8); // stored, no compression
    local.writeUInt32LE(crc,14);
    local.writeUInt32LE(file.length,18);
    local.writeUInt32LE(file.length,22);
    local.writeUInt16LE(filename.length,26);
    locals.push(local,filename,file);
    const central=Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50,0);
    central.writeUInt16LE(20,4);
    central.writeUInt16LE(20,6);
    central.writeUInt16LE(0x0800,8);
    central.writeUInt16LE(0,10);
    central.writeUInt32LE(crc,16);
    central.writeUInt32LE(file.length,20);
    central.writeUInt32LE(file.length,24);
    central.writeUInt16LE(filename.length,28);
    central.writeUInt32LE(pos,42);
    centrals.push(central,filename);
    pos+=local.length+filename.length+file.length;
  }
  if(files.length>65535)throw Error('ZIP_TOO_MANY_ENTRIES');
  const cd=Buffer.concat(centrals);
  const tail=Buffer.alloc(22);
  tail.writeUInt32LE(0x06054b50,0);
  tail.writeUInt16LE(files.length,8);
  tail.writeUInt16LE(files.length,10);
  tail.writeUInt32LE(cd.length,12);
  tail.writeUInt32LE(pos,16);
  return Buffer.concat([...locals,cd,tail]);
}
