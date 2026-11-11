# Üçüncü taraf kütüphaneler (değiştirilmeden dağıtılır)

## vendor/occt — Open CASCADE Technology (OCCT), WebAssembly
- Dosyalar: `replicad_single.js`, `replicad_single.wasm` (değiştirilmedi)
- Kaynak: replicad-opencascadejs paketi, https://github.com/sgenoud/replicad (packages/replicad-opencascadejs/dist), sürüm 1.2.1 deposu
- İçerik: OCCT 7.x'in Emscripten ile derlenmiş hali (opencascade.js derleme sistemi): B-Rep, Boolean (BRepAlgoAPI), yuvarlama / pah (BRepFilletAPI), STEP okuma / yazma, BRepCheck, ShapeFix, üçgenleme
- Lisans: GNU LGPL 2.1 (`LICENSE`). OCCT'nin kendisi LGPL 2.1 + Open CASCADE istisnası.
  Kütüphane uygulamadan ayrı dosya olarak, değiştirilmeden yüklenir; kullanıcı kendi derlemesini aynı adla koyarak değiştirebilir.
  Kaynak kodu: https://github.com/Open-Cascade-SAS/OCCT , https://github.com/donalffons/opencascade.js , https://github.com/sgenoud/replicad
- Bu derlemede IGES yazıcısı (IGESControl_Writer) YOK.

## vendor/occt-import — occt-import-js (IGES / STEP / BREP okuyucu)
- Dosyalar: `occt-import-js.js`, `occt-import-js.wasm` (değiştirilmedi)
- Kaynak: https://github.com/kovacsv/occt-import-js (dist)
- Lisans: LGPL 2.1 (`license.occt-import-js.txt`, `license.occt.txt`)
- Uygulamada yalnız IGES içe aktarma için kullanılır.

## tests/fixtures/cube-10mm.igs
- occt-import-js deposunun test dosyası (test/testfiles/cube-10x10mm), IGES içe aktarma testi için.
