// Mini CAD - 2. aşama: çoklu parça + birleştirme + oyuk açma (CSG)
// 3D kısım viewerHtml.js içinde (WebView / iframe + Three.js + three-bvh-csg, internet gerekir).

import React, { useRef, useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  StatusBar,
  Platform,
} from 'react-native';
import HTML from './viewerHtml';

// Web önizlemede iframe, telefonda WebView kullanılır.
const WebView = Platform.OS === 'web' ? null : require('react-native-webview').WebView;

const APP_NAME = 'Çizim Atölyesi'; // adını buradan değiştir


const num = (s) => parseFloat(String(s).replace(',', '.'));
const TYPE_LABEL = { box: 'Kutu', cylinder: 'Silindir' };
const NUM_KEYBOARD = Platform.OS === 'ios' ? 'numbers-and-punctuation' : 'numeric';

function Field({ label, value, onChange }) {
  return (
    <View style={s.field}>
      <Text style={s.label}>{label}</Text>
      <TextInput
        style={s.input}
        value={value}
        keyboardType={NUM_KEYBOARD}
        onChangeText={onChange}
      />
    </View>
  );
}

function Btn({ label, onPress, on, danger, flex }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[s.btn, on && s.btnOn, danger && s.btnDanger, flex && { flex: 1 }]}
    >
      <Text style={s.btnText}>{label}</Text>
    </TouchableOpacity>
  );
}

export default function App() {
  const webRef = useRef(null);
  const nextId = useRef(2);
  const [ready, setReady] = useState(false);
  const [parts, setParts] = useState([
    { id: 1, type: 'box', op: 'add', w: '80', l: '60', h: '40', d: '50', x: '0', y: '0', z: '0' },
  ]);
  const [sel, setSel] = useState(1);

  const cur = parts.find((p) => p.id === sel) || parts[0];
  const curIndex = parts.findIndex((p) => p.id === cur.id);

  const send = (refit) => {
    if (!ready || !webRef.current) return;
    const payload = {
      parts: parts.map((p) => ({
        type: p.type,
        op: p.op,
        w: num(p.w), l: num(p.l), h: num(p.h), d: num(p.d),
        x: num(p.x) || 0, y: num(p.y) || 0, z: num(p.z) || 0,
      })),
      refit,
    };
    if (Platform.OS === 'web') {
      const w = webRef.current && webRef.current.contentWindow;
      if (w) w.postMessage({ cmd: 'parts', payload }, '*');
      return;
    }
    webRef.current.injectJavaScript(
      'window.updateParts(' + JSON.stringify(payload) + '); true;'
    );
  };

  useEffect(() => { send(false); }, [parts, ready]);

  // Web önizlemede iframe "ready" mesajını window'a gönderir
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const h = (e) => { if (e.data === 'ready') setReady(true); };
    window.addEventListener('message', h);
    return () => window.removeEventListener('message', h);
  }, []);

  const upd = (k, val) =>
    setParts((ps) => ps.map((p) => (p.id === cur.id ? { ...p, [k]: val } : p)));

  const baseH = num(parts[0] && parts[0].h) || 40;

  const addPart = (type, op) => {
    const id = nextId.current++;
    const p =
      op === 'sub'
        // delik: taban parçadan iki ucu 1 mm taşsın (yüzey çakışması olmasın)
        ? { id, type, op, w: '20', l: '20', h: String(baseH + 2), d: '20', x: '0', y: '-1', z: '0' }
        // ekleme: taban parçanın üstüne otursun
        : { id, type, op, w: '30', l: '30', h: '20', d: '30', x: '0', y: String(baseH), z: '0' };
    setParts([...parts, p]);
    setSel(id);
  };

  const removeCur = () => {
    if (parts.length < 2) return;
    const rest = parts.filter((p) => p.id !== cur.id);
    setParts(rest);
    setSel(rest[0].id);
  };

  const label = (p, i) =>
    (i + 1) + '. ' + TYPE_LABEL[p.type] + (i > 0 && p.op === 'sub' ? ' (oyuk)' : '');

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" />
      <Text style={s.title}>{APP_NAME}</Text>

      <View style={s.chipsWrap}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {parts.map((p, i) => (
            <TouchableOpacity
              key={p.id}
              onPress={() => setSel(p.id)}
              style={[
                s.chip,
                p.op === 'sub' && i > 0 && s.chipSub,
                p.id === cur.id && s.chipOn,
              ]}
            >
              <Text style={s.btnText}>{label(p, i)}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <View style={s.row}>
        <Btn flex label="+ Kutu" onPress={() => addPart('box', 'add')} />
        <Btn flex label="+ Silindir" onPress={() => addPart('cylinder', 'add')} />
        <Btn flex label="○ Delik" onPress={() => addPart('cylinder', 'sub')} />
        <Btn flex label="□ Delik" onPress={() => addPart('box', 'sub')} />
      </View>

      <View style={s.row}>
        <Btn flex label="Kutu" on={cur.type === 'box'} onPress={() => upd('type', 'box')} />
        <Btn flex label="Silindir" on={cur.type === 'cylinder'} onPress={() => upd('type', 'cylinder')} />
        {curIndex > 0 && (
          <>
            <Btn flex label="Birleştir" on={cur.op === 'add'} onPress={() => upd('op', 'add')} />
            <Btn flex label="Oyuk aç" on={cur.op === 'sub'} onPress={() => upd('op', 'sub')} />
          </>
        )}
      </View>

      <View style={s.row}>
        {cur.type === 'box' ? (
          <>
            <Field label="Genişlik" value={cur.w} onChange={(t) => upd('w', t)} />
            <Field label="Derinlik" value={cur.l} onChange={(t) => upd('l', t)} />
            <Field label="Yükseklik" value={cur.h} onChange={(t) => upd('h', t)} />
          </>
        ) : (
          <>
            <Field label="Çap" value={cur.d} onChange={(t) => upd('d', t)} />
            <Field label="Yükseklik" value={cur.h} onChange={(t) => upd('h', t)} />
          </>
        )}
      </View>

      <View style={s.row}>
        <Field label="X (sağ-sol)" value={cur.x} onChange={(t) => upd('x', t)} />
        <Field label="Y (alt)" value={cur.y} onChange={(t) => upd('y', t)} />
        <Field label="Z (ön-arka)" value={cur.z} onChange={(t) => upd('z', t)} />
      </View>

      <View style={s.row}>
        <Btn flex label="Sığdır" onPress={() => send(true)} />
        <Btn flex danger label="Bu parçayı sil" onPress={removeCur} />
      </View>

      {Platform.OS === 'web' ? (
        <View style={s.web}>
          {React.createElement('iframe', {
            ref: webRef,
            srcDoc: HTML,
            style: { border: 'none', width: '100%', height: '100%', backgroundColor: '#0f172a' },
          })}
        </View>
      ) : (
        <WebView
          ref={webRef}
          style={s.web}
          originWhitelist={['*']}
          source={{ html: HTML, baseUrl: 'https://localhost' }}
          javaScriptEnabled
          onMessage={(e) => {
            if (e.nativeEvent.data === 'ready') setReady(true);
          }}
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0f172a',
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 44,
  },
  title: { color: '#fff', fontSize: 18, fontWeight: '700', textAlign: 'center', marginVertical: 4 },
  chipsWrap: { paddingHorizontal: 12, marginBottom: 6 },
  chip: {
    paddingHorizontal: 12, paddingVertical: 8, marginRight: 6, borderRadius: 16,
    backgroundColor: '#1e293b',
  },
  chipSub: { backgroundColor: '#7f1d1d' },
  chipOn: { borderWidth: 2, borderColor: '#38bdf8' },
  row: { flexDirection: 'row', paddingHorizontal: 12, marginBottom: 6 },
  btn: {
    paddingVertical: 8, paddingHorizontal: 6, marginHorizontal: 3, borderRadius: 8,
    backgroundColor: '#1e293b', alignItems: 'center',
  },
  btnOn: { backgroundColor: '#0284c7' },
  btnDanger: { backgroundColor: '#7f1d1d' },
  btnText: { color: '#fff', fontWeight: '600', fontSize: 13 },
  field: { flex: 1, marginHorizontal: 3 },
  label: { color: '#94a3b8', fontSize: 11, marginBottom: 2 },
  input: {
    backgroundColor: '#1e293b', color: '#fff', borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 6, fontSize: 15,
  },
  web: { flex: 1, backgroundColor: '#0f172a' },
});
