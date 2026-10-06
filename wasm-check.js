/* この画面でWebAssemblyを使えるか確かめる小さな下調べ */
try{new WebAssembly.Module(new Uint8Array([0,97,115,109,1,0,0,0]));postMessage("ok")}catch(e){postMessage("ng:"+(e&&e.name))}
