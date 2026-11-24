// get it office: kantor tim AI Arya.
// Mode tamu baca view publik. Mode bos (akun Arya) baca tabel lengkap, jawab keputusan, kirim pesan.
// Data ditarik tiap 12 detik. Semua gerakan karakter digerakin dari perubahan data asli.
// Di localhost bisa ?demo=tamu atau ?demo=bos buat tes pakai data tiruan (ga nyentuh server).
'use strict'
const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)]
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
const pad = n => String(n).padStart(2, '0')
const tms = t => { const d = new Date(t); return isNaN(d) ? NaN : d.getTime() }
const jam = t => { const d = new Date(t); return isNaN(d) ? '--.--' : pad(d.getHours()) + '.' + pad(d.getMinutes()) }
const potong = (s, n) => { s = String(s || ''); return s.length > n ? s.slice(0, n - 1) + '…' : s }
const store = { get(k) { try { return localStorage.getItem(k) } catch (e) { return null } }, set(k, v) { try { localStorage.setItem(k, v) } catch (e) { } } }

const CFG = { url: 'https://wtfshyfgcrglknogjgfb.supabase.co', kunci: 'sb_publishable_-vUvZe04JtPTTGfF6LEY6A_y0l1n_Ff', poll: 12000 }
const LOKAL = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname)
const DEMO = LOKAL ? new URLSearchParams(location.search).get('demo') : null
let sb = null
try { if (!DEMO && window.supabase && window.supabase.createClient) sb = window.supabase.createClient(CFG.url, CFG.kunci, { auth: { persistSession: true, autoRefreshToken: true, storageKey: 'gio-auth' } }) } catch (e) { sb = null }

/* ---------- status & ruangan ---------- */
const ST = { jalan: { l: 'Lagi jalan', c: 'var(--s-jalan)' }, nunggu: { l: 'Nunggu lu', c: 'var(--accent)' }, beres: { l: 'Beres', c: 'var(--s-beres)' }, diam: { l: 'Diam', c: 'var(--s-diam)' }, gagal: { l: 'Gagal', c: 'var(--s-gagal)' } }
const st = s => ST[s] || ST.diam
const ROOMS = [
  { key: 'Ruang Loker', x: 30, y: 30, w: 320, h: 210, c: '--r-loker' },
  { key: 'Ruang Riset', x: 380, y: 30, w: 240, h: 210, c: '--r-riset' },
  { key: 'Ruang Lamaran', x: 650, y: 30, w: 320, h: 210, c: '--r-lamaran' },
  { key: 'Kelas', x: 30, y: 270, w: 320, h: 210, c: '--r-kelas' },
  { key: 'Ruang Manajer', x: 380, y: 270, w: 240, h: 210, c: '--accent', office: 1 },
  { key: 'Studio', x: 650, y: 270, w: 320, h: 210, c: '--r-studio' },
  { key: 'Ruang QA', x: 30, y: 510, w: 320, h: 210, c: '--r-qa' },
  { key: 'Lobi', x: 380, y: 510, w: 240, h: 210, c: '--r-lobi', lobby: 1 },
  { key: 'Pantry', x: 650, y: 510, w: 320, h: 210, c: '--r-lobi', decor: 1 },
]
const roomOf = r => { const k = String(r || '').trim().toLowerCase(); return ROOMS.find(x => !x.decor && x.key.toLowerCase() === k) || ROOMS.find(x => x.lobby) }

/* ---------- keadaan ---------- */
let MODE = 'tamu', USER = null, TIM = [], KABAR = [], KEP = [], PESAN = [], PESAN_LOKAL = []
let ERR = null, LAST = 0, FIRST = true, busy = false, cur = 'kantor', INFO = '', pollT = null
const byId = id => TIM.find(p => p.id === id)
const siapa = x => { if (!x) return null; const k = String(x).trim().toLowerCase(); return TIM.find(p => p.id === k || String(p.nama || '').toLowerCase() === k) || null }
const nama = p => p ? (p.nama || p.id) : '?'
const warna = p => !p ? 'var(--ink3)' : p.id === 'manajer' ? 'var(--accent)' : `var(${roomOf(p.ruang).c})`
const pending = () => KEP.filter(d => !d.jawaban)
const detail = p => p && (p.tugas_detail || p.detail || p.tugas_lengkap || p.keterangan) || ''

/* ---------- sumber data: Supabase ---------- */
const REAL = {
  async tim(mode) {
    const q = mode === 'bos' ? sb.from('office_tim').select('*') : sb.from('office_tim_publik').select('id,nama,jabatan,ruang,urut,status,tugas,progres,diperbarui')
    const { data, error } = await q.order('urut', { ascending: true }); if (error) throw error; return data || []
  },
  async kabar(mode) {
    const q = mode === 'bos' ? sb.from('office_kabar').select('*') : sb.from('office_kabar_publik').select('id,waktu,siapa,kanal,teks')
    const { data, error } = await q.order('waktu', { ascending: false }).limit(150); if (error) throw error; return data || []
  },
  async keputusan() { const { data, error } = await sb.from('office_keputusan').select('*').order('dibuat', { ascending: false }).limit(60); if (error) throw error; return data || [] },
  async pesan() { const { data, error } = await sb.from('office_pesan').select('*').limit(80); if (error) throw error; return data || [] },
  async jawab(id, jawaban, catatan) {
    const { data, error } = await sb.from('office_keputusan').update({ jawaban, catatan_jawaban: catatan || null, dijawab: new Date().toISOString() }).eq('id', id).select('id')
    if (error) throw error; if (!data || !data.length) throw new Error('Akun ini ga punya izin jawab keputusan.')
  },
  async kirim(untuk, teks) { const { error } = await sb.from('office_pesan').insert({ untuk, teks }); if (error) throw error },
  async masuk(email, sandi) { const { data, error } = await sb.auth.signInWithPassword({ email, password: sandi }); if (error) throw error; return data.user },
  async keluar() { try { await sb.auth.signOut({ scope: 'local' }) } catch (e) { } },
}

/* ---------- sumber data: tiruan (cuma localhost ?demo=) ---------- */
const MOCK = (() => {
  const now = Date.now(), iso = t => new Date(t).toISOString(), m = 60000
  const rows = [['manajer', 'Manajer', 'Kepala tim', 'Ruang Manajer', 'jalan', 'Bagi tugas run 15.00', null],
    ['raka', 'Raka', 'Pencari loker', 'Ruang Loker', 'jalan', 'Nyisir portal umum', 40], ['dimas', 'Dimas', 'Pencari loker', 'Ruang Loker', 'jalan', 'Nyisir situs karier bank', 65],
    ['sekar', 'Sekar', 'Pencari loker', 'Ruang Loker', 'diam', '', null], ['wulan', 'Wulan', 'Penilai loker', 'Ruang Loker', 'nunggu', 'Nunggu keputusan: MT Bank Contoh', null],
    ['bayu', 'Bayu', 'Penyusun lamaran', 'Ruang Lamaran', 'jalan', 'Susun CV PT Contoh Data', 30], ['tegar', 'Tegar', 'Pemeriksa fakta CV', 'Ruang Lamaran', 'beres', 'Cek klaim CV v2', 100],
    ['tari', 'Tari', 'Penjaga tenggat', 'Ruang Lamaran', 'diam', '', null], ['galih', 'Galih', 'Peneliti', 'Ruang Riset', 'jalan', 'Riset gaji data analyst', 55],
    ['nadia', 'Nadia', 'Pelatih interview', 'Kelas', 'diam', '', null], ['laras', 'Laras', 'Pelatih bahasa Inggris', 'Kelas', 'jalan', 'Koreksi speaking IELTS', 20],
    ['putri', 'Putri', 'Tutor skill', 'Kelas', 'diam', '', null], ['adit', 'Adit', 'Analis portofolio', 'Studio', 'jalan', 'Rapihin porto NO2', 70],
    ['citra', 'Citra', 'Penulis LinkedIn', 'Studio', 'gagal', 'Draft post LinkedIn', null], ['rara', 'Rara', 'Desainer produk', 'Studio', 'jalan', 'Bangun get it office', 80],
    ['joko', 'Joko', 'Penguji', 'Ruang QA', 'jalan', 'Uji get it office di HP', 10]]
  const tim = rows.map((a, i) => ({ id: a[0], nama: a[1], jabatan: a[2], ruang: a[3], urut: i, status: a[4], tugas: a[5], progres: a[6], diperbarui: iso(now - i * 3 * m), tugas_detail: 'Catatan tiruan buat ' + a[1] }))
  let kn = 0
  const kabar = [], add = (siapa, kanal, teks, t = Date.now()) => kabar.unshift({ id: 'k' + (++kn), waktu: iso(t), siapa, kanal, teks })
  ;[['manajer', 'umum', 'Pagi tim. Run pencarian 07.00 udah jalan.', 300], ['raka', 'loker', 'Mulai nyisir portal umum.', 280], ['dimas', 'loker', 'Dapet 6 loker baru dari situs bank.', 240],
    ['wulan', 'loker', 'Nilai 7 loker, 3 lolos saringan.', 200], ['bayu', 'lamaran', 'Mulai susun CV buat PT Contoh Data.', 160], ['tegar', 'lamaran', 'Beres cek klaim CV v2, aman.', 90],
    ['citra', 'karya', 'Draft LinkedIn gagal diambil, sumbernya ga kebuka.', 60], ['rara', 'karya', 'get it office udah 80%.', 20], ['manajer', 'umum', 'Joko, tolong uji get it office di HP ya.', 8]]
    .forEach(([s, k, t, ago]) => add(s, k, t, now - ago * m))
  const kep = [
    { id: 'd1', dibuat: iso(now - 50 * m), siapa: 'wulan', judul: 'Lamar MT Bank Contoh?', isi: 'Nilai cocok 4,3 dari 5. Tutup 30 Nov.', pilihan: ['Lamar', 'Tunda', 'Lewati'], jawaban: null, catatan_jawaban: null, dijawab: null },
    { id: 'd2', dibuat: iso(now - 30 * m), siapa: 'bayu', judul: 'Kirim paket lamaran PT Contoh Data?', isi: 'CV, surat, porto udah dicek Tegar.', pilihan: ['Kirim', 'Revisi dulu'], jawaban: null, catatan_jawaban: null, dijawab: null },
    { id: 'd3', dibuat: iso(now - 12 * m), siapa: 'citra', judul: 'Coba ulang draft LinkedIn besok?', isi: 'Sumber datanya lagi down.', pilihan: ['Coba besok', 'Ganti topik'], jawaban: null, catatan_jawaban: null, dijawab: null },
    { id: 'd0', dibuat: iso(now - 200 * m), siapa: 'nadia', judul: 'Latihan interview malam ini?', isi: '', pilihan: ['Gas', 'Besok'], jawaban: 'Gas', catatan_jawaban: null, dijawab: iso(now - 190 * m) }]
  const pesan = []
  const TUGAS = ['Nyisir IG loker MT', 'Siapin soal interview', 'Cek tenggat minggu ini', 'Riset profil perusahaan', 'Rapihin headline LinkedIn', 'Uji alur lamaran']
  const pick = a => a[Math.floor(Math.random() * a.length)]
  function gerak() {
    const t = Date.now(), r = Math.random()
    const jalan = tim.filter(p => p.id !== 'manajer' && p.status === 'jalan'), diam = tim.filter(p => p.status === 'diam' || p.status === 'beres')
    if (r < .45 && jalan.length) { const p = pick(jalan); p.progres = Math.min(100, (p.progres || 0) + 20); p.diperbarui = iso(t); if (p.progres >= 100) { p.status = 'beres'; add(p.id, 'umum', 'Beres: ' + p.tugas) } }
    else if (r < .75 && diam.length) { const p = pick(diam); p.status = 'jalan'; p.tugas = pick(TUGAS); p.progres = 0; p.diperbarui = iso(t); add(p.id, 'umum', 'Mulai: ' + p.tugas) }
    else if (jalan.length) { const p = pick(jalan); add('manajer', 'umum', `${p.nama}, gimana ${p.tugas.toLowerCase()}? Kabarin ya.`) }
  }
  const salin = x => JSON.parse(JSON.stringify(x)), tunda = () => new Promise(r => setTimeout(r, 200))
  return {
    async tim(mode) { await tunda(); gerak(); return salin(mode === 'bos' ? tim : tim.map(({ tugas_detail, ...r }) => r)) },
    async kabar() { await tunda(); return salin(kabar) },
    async keputusan() { await tunda(); return salin(kep) },
    async pesan() { await tunda(); return salin(pesan) },
    async jawab(id, jawaban, catatan) { await tunda(); const d = kep.find(x => x.id === id); Object.assign(d, { jawaban, catatan_jawaban: catatan || null, dijawab: iso(Date.now()) }) },
    async kirim(untuk, teks) { await tunda(); pesan.push({ id: 'p' + pesan.length, dibuat: iso(Date.now()), untuk, teks }) },
    async masuk(email) { await tunda(); return { email: email || 'contoh@lokal' } },
    async keluar() { },
  }
})()
const SRC = DEMO ? MOCK : REAL

/* ---------- tarik data ---------- */
async function tarik() {
  if (busy) return
  if (!DEMO && !sb) { ERR = 'Library database ga kebuka. Cek koneksi terus muat ulang halaman.'; render(); return }
  busy = true; renderLive()
  try {
    let tim = await SRC.tim(MODE)
    if (MODE === 'bos' && !tim.length) {
      const pub = await SRC.tim('tamu').catch(() => [])
      if (pub.length) { MODE = 'tamu'; INFO = 'Akun ini ga punya akses bos, jadi yang tampil mode tamu.'; tim = pub }
    }
    const [kabar, kep, pesan] = await Promise.all([SRC.kabar(MODE), MODE === 'bos' ? SRC.keputusan() : [], MODE === 'bos' ? SRC.pesan().catch(() => null) : []])
    terapkan(tim, kabar, kep, pesan)
    ERR = null; LAST = Date.now()
  } catch (e) {
    console.error(e)
    const m = (e && e.message) || ''
    ERR = /fetch|network|load failed/i.test(m) ? 'Lagi offline atau server ga kejangkau. Dicoba lagi otomatis.' : 'Gagal ambil data kantor: ' + m
  }
  busy = false; render()
}
function terapkan(tim, kabar, kep, pesan) {
  const lama = new Map(TIM.map(p => [p.id, p]))
  TIM = tim.slice().sort((a, b) => (a.urut ?? 99) - (b.urut ?? 99))
  const kenal = new Set(KABAR.map(k => k.id))
  KABAR = kabar.slice().sort((a, b) => tms(a.waktu) - tms(b.waktu))
  const kepLama = new Set(pending().map(d => d.id))
  KEP = kep || []
  if (pesan) { PESAN = pesan; PESAN_LOKAL = PESAN_LOKAL.filter(l => !PESAN.some(p => p.teks === l.teks)) }
  if (FIRST) { FIRST = false; return }
  // gerakan dari perubahan status
  TIM.forEach(p => {
    const q = lama.get(p.id); if (!q) { say(p.id, 'Halo semua!'); return }
    if (q.status !== p.status) aksiStatus(p, q)
    else if (p.status === 'jalan' && q.tugas !== p.tugas && p.tugas) say(p.id, 'Lanjut: ' + p.tugas)
  })
  // kabar baru: gelembung satu-satu
  KABAR.filter(k => !kenal.has(k.id)).forEach((k, i) => setTimeout(() => aksiKabar(k), 700 + i * 1100))
  // keputusan baru
  pending().filter(d => !kepLama.has(d.id)).forEach(d => { const p = siapa(d.siapa); toast(p, 'Butuh keputusan lu: ' + (d.judul || ''), true, () => openDesk(d.id)) })
}
function aksiStatus(p, q) {
  if (p.status === 'jalan') say(p.id, p.tugas ? 'Mulai: ' + p.tugas : 'Gas, mulai!')
  else if (p.status === 'nunggu') say(p.id, 'Butuh keputusan bos', true)
  else if (p.status === 'beres') { kunjungi(p.id, 'manajer', 7000); say(p.id, 'Bos, udah beres nih'); setTimeout(() => say('manajer', 'Mantap, makasih ' + nama(p)), 2200); toast(p, `${nama(p)} beres: ${p.tugas || 'tugasnya'}`) }
  else if (p.status === 'gagal') { say(p.id, 'Waduh, gagal', true); toast(p, `${nama(p)} gagal: ${p.tugas || 'tugasnya'}`) }
}
function aksiKabar(k) {
  const p = siapa(k.siapa); if (!p) return
  // nyebut orang lain: samperin mejanya buat ngobrol
  const lain = TIM.find(x => x.id !== p.id && x.nama && new RegExp('(^|[^\\p{L}])' + x.nama.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '($|[^\\p{L}])', 'iu').test(k.teks || ''))
  if (lain) { kunjungi(p.id, 'orang:' + lain.id, 6500); setTimeout(() => say(lain.id, 'Siap!'), 2600) }
  say(p.id, k.teks || '')
  if (cur === 'kantor') K.update()
}

/* ---------- kunjungan (jalan ke ruang Manajer / meja orang) ---------- */
const VIS = {}
function kunjungi(id, ke, lama) { VIS[id] = { ke, sampai: Date.now() + lama }; K.update(); setTimeout(() => K.update(), lama + 60) }

/* ---------- helper UI ---------- */
function av(p, cls = '') {
  if (p === 'arya') return `<span class="av me ${cls}">A</span>`
  if (!p) return `<span class="av ${cls}" style="--c:var(--ink3)">?</span>`
  return `<button class="av ${cls} ${p.id === 'manajer' ? 'mgr' : ''}" style="--c:${warna(p)}" data-id="${esc(p.id)}" aria-label="Profil ${esc(nama(p))}">${esc(nama(p)[0].toUpperCase())}<i class="st" style="background:${st(p.status).c}"></i></button>`
}
function toast(p, text, hot, fn) {
  const el = document.createElement('div'); el.className = 'toast' + (hot ? ' hot' : '')
  el.innerHTML = (p ? `<span class="av" style="--c:${warna(p)}">${esc(nama(p)[0].toUpperCase())}</span>` : '') + `<div>${esc(text)}</div>`
  el.addEventListener('click', () => { fn ? fn() : p && openProfile(p.id); el.remove() })
  const box = $('#toasts'); box.prepend(el); while (box.children.length > 3) box.lastChild.remove()
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 320) }, 4500)
}
function say(id, text, hot) { K.say(id, text, hot) }
const kabarOrang = id => KABAR.filter(k => { const p = siapa(k.siapa); return p && p.id === id })

/* ---------- navigasi ---------- */
const VIEWS = [
  { id: 'kantor', l: 'Kantor', i: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 12h6M15 12h6M12 4v5M12 15v5"/>' },
  { id: 'chat', l: 'Grup chat', i: '<path d="M4 5h16v11H10l-5 4v-4H4z"/>' },
]
const navHtml = () => VIEWS.map(v => `<button class="nav" data-view="${v.id}"><svg viewBox="0 0 24 24">${v.i}</svg>${v.l}${v.id === 'chat' ? '<span class="nb"></span>' : ''}</button>`).join('')
$('#rail').innerHTML = navHtml(); $('#tabbar').innerHTML = navHtml()
function show(v) {
  if (!VIEWS.some(x => x.id === v)) v = 'kantor'; cur = v
  VIEWS.forEach(x => { $('#v-' + x.id).hidden = x.id !== v })
  $$('.nav').forEach(b => b.setAttribute('aria-current', b.dataset.view === v))
  if (location.hash !== '#' + v) history.replaceState(null, '', location.pathname + location.search + '#' + v)
  if (v === 'kantor') { K.resize(); K.update() }
  if (v === 'chat') CH.render(true)
}
addEventListener('hashchange', () => show(location.hash.slice(1)))

/* ---------- header, pulse ---------- */
function renderLive() {
  const el = $('#live'), t = $('#liveTxt')
  el.classList.toggle('err', !!ERR); el.classList.toggle('off', !LAST && !ERR)
  if (ERR) t.textContent = 'offline'
  else if (!LAST) t.textContent = busy ? 'nyambung…' : '-'
  else { const s = Math.round((Date.now() - LAST) / 1000); t.textContent = s < 5 ? 'barusan' : s < 60 ? s + ' dtk lalu' : jam(LAST) }
}
function renderHeader() {
  const bos = MODE === 'bos'
  $('#btnDesk').hidden = !bos; $('#btnMasuk').hidden = !!USER; $('#btnAkun').hidden = !USER
  const n = pending().length, b = $('#deskCount')
  if (b.textContent !== String(n)) { b.textContent = n; const d = $('#btnDesk'); d.classList.remove('bump'); void d.offsetWidth; d.classList.add('bump') }
}
function renderPulse() {
  const c = { jalan: 0, nunggu: 0, beres: 0, gagal: 0, diam: 0 }; TIM.forEach(p => { c[ST[p.status] ? p.status : 'diam']++ })
  const mode = DEMO ? `<span class="chip mode demo">Data tiruan · ${MODE}</span>` : `<span class="chip mode">${MODE === 'bos' ? 'Mode bos' : 'Mode tamu'}</span>`
  const n = pending().length
  $('#pulse').innerHTML = mode + `<span class="chip"><i style="background:var(--s-jalan)"></i>${c.jalan} jalan</span>`
    + (MODE === 'bos' ? `<button class="chip ${n ? 'hot' : ''}" data-open-desk><i style="background:var(--accent)"></i>${n} keputusan nunggu</button>` : `<span class="chip"><i style="background:var(--accent)"></i>${c.nunggu} nunggu</span>`)
    + `<span class="chip"><i style="background:var(--s-beres)"></i>${c.beres} beres</span>`
    + (c.gagal ? `<span class="chip"><i style="background:var(--s-gagal)"></i>${c.gagal} gagal</span>` : '')
    + `<span class="chip"><i style="background:var(--s-diam)"></i>${c.diam} diam</span>`
    + `<span class="chip">${TIM.length} orang</span>`
  const bn = $('#banner')
  if (ERR) { bn.hidden = false; bn.className = 'banner'; bn.innerHTML = `<span>${esc(ERR)}</span><button class="btn" data-retry style="height:32px">Coba lagi</button>` }
  else if (INFO) { bn.hidden = false; bn.className = 'banner info'; bn.innerHTML = `<span>${esc(INFO)}</span><button class="btn ghost" data-tutup-info style="height:32px">Tutup</button>` }
  else bn.hidden = true
}
let deskSig = ''
function render() {
  renderLive(); renderHeader(); renderPulse(); K.update(); CH.render(); renderProfile()
  // Meja bos cuma digambar ulang kalau daftar keputusannya berubah, biar catatan yang lagi diketik ga ilang
  const s = KEP.map(d => d.id + ':' + (d.jawaban || '')).join(',')
  if ($('#desk').classList.contains('on') && !$('#tk.out') && s !== deskSig) renderDesk()
}

/* ---------- KANTOR ---------- */
const K = (() => {
  const svg = $('#floor'), VW = 1000, VH = 750
  const HAIR = ['M-8 -10a8 8 0 0 1 16 0v1h-16z', 'M-8.6 -10a8.6 8.6 0 0 1 17.2 0v10h-3.6v-8h-10v8h-3.6z', 'M-8 -10a8 8 0 0 1 16 0l-3 -1.5-3 2-3-2-3 2-4 -.5z']
  const hairOf = id => [...String(id)].reduce((a, c) => a + c.charCodeAt(0), 0) % 3
  const MGR = ROOMS.find(r => r.office)
  const SPOT = [[MGR.x + 52, MGR.y + 172], [MGR.x + MGR.w - 52, MGR.y + 172], [MGR.x + MGR.w / 2, MGR.y + 182]]
  let h = `<defs><pattern id="tilep" width="40" height="40" patternUnits="userSpaceOnUse" class="tile"><path d="M40 0H0V40" fill="none" stroke-width="1"/></pattern></defs>
    <rect x="-700" y="-700" width="2400" height="2150" style="fill:var(--floor)"/><rect x="-700" y="-700" width="2400" height="2150" fill="url(#tilep)"/>`
  ROOMS.forEach(r => {
    h += `<g class="zone ${r.office ? 'office' : ''} ${r.decor ? 'decor' : ''}" data-room="${esc(r.key)}"><rect class="z" x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" rx="16"/>`
      + (r.office || r.decor ? '' : `<rect class="strip" x="${r.x + 16}" y="${r.y + r.h - 6}" width="${r.w - 32}" height="3" rx="1.5" style="fill:var(${r.c})"/>`)
      + `<text class="zl" x="${r.x + 14}" y="${r.y + 22}">${esc(r.key.toUpperCase())}<tspan class="zn" data-zn="${esc(r.key)}"></tspan></text></g>`
  })
  const P2 = ROOMS.find(r => r.decor), LB = ROOMS.find(r => r.lobby)
  h += `<rect class="deco" x="${P2.x + 24}" y="${P2.y + 44}" width="150" height="22" rx="5"/><rect class="deco2" x="${P2.x + 130}" y="${P2.y + 30}" width="22" height="18" rx="3"/>`
    + `<circle class="deco2" cx="${P2.x + 230}" cy="${P2.y + 120}" r="34"/><circle class="deco" cx="${P2.x + 92}" cy="${P2.y + 140}" r="20"/>`
    + `<text class="sign" x="${LB.x + LB.w / 2}" y="${LB.y + 92}" text-anchor="middle">get it office</text><rect class="deco" x="${LB.x + 50}" y="${LB.y + 150}" width="${LB.w - 100}" height="26" rx="10"/>`
    + `<circle class="deco2" cx="${MGR.x + 26}" cy="${MGR.y + 48}" r="10"/>`
  h += `<g id="desks"></g><g id="chars"></g>`
  svg.innerHTML = h
  const els = {}, last = {}
  let filt = null, seats = {}

  function layout() {
    const seat = {}, desks = [], groups = new Map()
    TIM.forEach(p => { if (p.id === 'manajer') return; const r = roomOf(p.ruang); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(p) })
    if (byId('manajer')) { seat.manajer = [MGR.x + MGR.w / 2, MGR.y + 110]; desks.push({ id: 'manajer', x: seat.manajer[0], y: seat.manajer[1], big: 1 }) }
    groups.forEach((list, r) => {
      if (r.office) { list.forEach((p, i) => { const s = [i % 2 ? r.x + r.w - 40 : r.x + 40, r.y + 92 + Math.floor(i / 2) * 64]; seat[p.id] = s; desks.push({ id: p.id, x: s[0], y: s[1] }) }); return }
      const cols = r.w >= 300 ? (list.length > 6 ? 4 : 3) : 2, rows = Math.ceil(list.length / cols)
      list.forEach((p, i) => {
        const c = i % cols, rr = Math.floor(i / cols), inRow = Math.min(cols, list.length - rr * cols)
        const y = rows === 1 ? r.y + 128 : r.y + 88 + rr * Math.min(82, (r.h - 118) / (rows - 1))
        const s = [r.x + r.w * (c + .5) / inRow, y]; seat[p.id] = s; desks.push({ id: p.id, x: s[0], y: s[1] })
      })
    })
    return { seat, desks, groups }
  }
  function pos(id) {
    const v = VIS[id]
    if (v && v.sampai > Date.now()) {
      if (v.ke === 'manajer') { const i = Object.keys(VIS).filter(k => VIS[k].ke === 'manajer' && VIS[k].sampai > Date.now()).indexOf(id); return SPOT[Math.max(0, i) % SPOT.length] }
      if (v.ke.startsWith('orang:')) { const s = seats[v.ke.slice(6)]; if (s) return [s[0] + 30, s[1] + 10] }
    }
    return seats[id] || [LB.x + LB.w / 2, LB.y + 120]
  }
  function charHtml(p) {
    const mgr = p.id === 'manajer'
    return `<g class="mv"><circle class="ring" r="22" cy="-2"/><g class="bob"><ellipse class="sh" cx="0" cy="15" rx="11" ry="3.5"/><rect class="body" x="-9.5" y="-2" width="19" height="17" rx="7"/>`
      + (mgr ? '<path d="M0 -1l-2.4 3 2.4 8 2.4-8z" style="fill:var(--ink)"/>' : '')
      + `<circle cy="-10" r="8" class="skin"/><path class="hair" d="${HAIR[hairOf(p.id)]}"/><circle class="sdot" cx="10" cy="-17" r="4"/></g>`
      + `<text class="tag" y="30" text-anchor="middle"></text><g class="pb" transform="translate(-18,35)"><rect class="pb-bg" width="36" height="4" rx="2"/><rect class="pb-f" width="0" height="4" rx="2"/></g><g class="bub"></g></g>`
  }
  function update() {
    const L = layout(); seats = L.seat
    $('#desks').innerHTML = L.desks.map(d => { const p = byId(d.id), w = d.big ? 70 : 46, on = p && p.status === 'jalan' && !(VIS[d.id] && VIS[d.id].sampai > Date.now())
      const dim = filt && p && roomOf(p.ruang).key !== filt && p.id !== 'manajer'
      return `<g class="desk ${on ? 'on' : ''} ${dim ? 'dim' : ''}"><rect class="deskTop" x="${d.x - w / 2}" y="${d.y - 40}" width="${w}" height="17" rx="4"/><rect class="mon" x="${d.x - 9}" y="${d.y - 51}" width="18" height="12" rx="2"/></g>` }).join('')
    const box = $('#chars'), ada = new Set()
    TIM.forEach(p => {
      ada.add(p.id)
      let g = els[p.id]
      if (!g) { g = document.createElementNS('http://www.w3.org/2000/svg', 'g'); g.setAttribute('class', 'ch'); g.dataset.id = p.id; g.innerHTML = charHtml(p); box.appendChild(g); els[p.id] = g }
      const mv = g.firstElementChild, [x, y] = pos(p.id), k = x.toFixed(0) + ',' + y.toFixed(0)
      if (last[p.id] !== k) { if (last[p.id]) { g.classList.add('walk'); clearTimeout(g._w); g._w = setTimeout(() => g.classList.remove('walk'), 1600) } else mv.style.transition = 'none'; last[p.id] = k; mv.style.transform = `translate(${x}px,${y}px)`; if (mv.style.transition) requestAnimationFrame(() => requestAnimationFrame(() => { mv.style.transition = '' })) }
      g.querySelector('.body').style.fill = warna(p)
      g.querySelector('.tag').textContent = nama(p)
      g.querySelector('.sdot').style.fill = st(p.status).c
      const pr = typeof p.progres === 'number' && p.status === 'jalan' ? Math.max(0, Math.min(100, p.progres)) : null
      g.querySelector('.pb').style.display = pr == null ? 'none' : ''; if (pr != null) { const f = g.querySelector('.pb-f'); f.setAttribute('width', 36 * pr / 100); f.style.fill = warna(p) }
      const visiting = VIS[p.id] && VIS[p.id].sampai > Date.now()
      g.classList.toggle('work', p.status === 'jalan' && !visiting); g.classList.toggle('nunggu', p.status === 'nunggu'); g.classList.toggle('gagal', p.status === 'gagal'); g.classList.toggle('diam', p.status === 'diam')
      g.classList.toggle('dim', !!filt && roomOf(p.ruang).key !== filt && p.id !== 'manajer')
      g.setAttribute('aria-label', `${nama(p)}, ${st(p.status).l}`)
    })
    Object.keys(els).forEach(id => { if (!ada.has(id)) { els[id].remove(); delete els[id]; delete last[id] } })
    $$('[data-zn]', svg).forEach(t => { const r = ROOMS.find(x => x.key === t.dataset.zn), n = (L.groups.get(r) || []).length + (r.office && byId('manajer') ? 1 : 0); t.textContent = n ? ' · ' + n : '' })
    $$('.zone', svg).forEach(z => z.classList.toggle('dim', !!filt && z.dataset.room !== filt && z.dataset.room !== MGR.key))
    // kabar terbaru
    const f = KABAR.slice(-3).reverse()
    $('#ticker').innerHTML = f.map(k => { const p = siapa(k.siapa); return `<div class="tk" role="button" tabindex="0" data-id="${p ? esc(p.id) : ''}">${av(p, 'sm')}<span class="x"><b>${esc(p ? nama(p) : k.siapa)}</b> ${esc(potong(k.teks, 120))}</span><time>${jam(k.waktu)}</time></div>` }).join('')
    $('#kFeedM').innerHTML = KABAR.length ? '<div class="eyebrow" style="padding:4px 2px">Kabar terbaru</div>' + KABAR.slice(-6).reverse().map(k => { const p = siapa(k.siapa); return `<div class="fi2" role="button" tabindex="0" data-id="${p ? esc(p.id) : ''}">${av(p, 'sm')}<span class="x"><b>${esc(p ? nama(p) : k.siapa)}</b> ${esc(potong(k.teks, 160))}</span><time>${jam(k.waktu)}</time></div>` }).join('') : ''
    // kosong
    const ke = $('#kEmpty')
    if (!TIM.length && (LAST || ERR)) { ke.hidden = false; ke.innerHTML = ERR ? `<div><h3>Kantor belum kebuka</h3><p>${esc(ERR)}</p><button class="btn pri" data-retry>Coba lagi</button></div>` : `<div><h3>Kantor masih kosong</h3><p>Belum ada data tim. Begitu Manajer nulis siapa ngerjain apa, karakternya muncul di sini dan mulai gerak.</p></div>` }
    else if (!TIM.length) { ke.hidden = false; ke.innerHTML = '<div><h3>Lagi buka kantor…</h3><p>Ngambil data tim.</p></div>' }
    else ke.hidden = true
    renderFilters(L)
  }
  let filtSig = ''
  function renderFilters(L) {
    const rooms = ROOMS.filter(r => !r.decor && !r.office && (L.groups.get(r) || []).length)
    const sig = rooms.map(r => r.key).join('|') + '#' + filt; if (sig === filtSig) return; filtSig = sig
    $('#kFilters').innerHTML = `<button class="chip" data-kf="" aria-pressed="${!filt}">Semua</button>` + rooms.map(r => `<button class="chip" data-kf="${esc(r.key)}" aria-pressed="${filt === r.key}"><i style="background:var(${r.c})"></i>${esc(r.key)}</button>`).join('')
  }
  function sayFn(id, text, hot) {
    const g = els[id]; if (!g || cur !== 'kantor') return
    const b = g.querySelector('.bub'), t = potong(text, 32), w = Math.round(t.length * 6.5 + 20)
    b.innerHTML = `<g class="bubble ${hot ? 'hot' : ''}"><rect x="${-w / 2}" y="-62" width="${w}" height="24" rx="12"/><path d="M-5 -38.5L0 -32l5-6.5z"/><text y="-46" text-anchor="middle"></text></g>`
    b.querySelector('text').textContent = t
    clearTimeout(b._t); b._t = setTimeout(() => { b.innerHTML = '' }, 3600)
  }
  // geser & zoom
  const vb = { x: 0, y: 0, w: VW, h: VH }; let asp = VW / VH, fitted = false
  const apply = () => svg.setAttribute('viewBox', `${vb.x.toFixed(1)} ${vb.y.toFixed(1)} ${vb.w.toFixed(1)} ${vb.h.toFixed(1)}`)
  function clamp() { vb.w = Math.min(1600, Math.max(260, vb.w)); vb.h = vb.w / asp; const cx = Math.min(VW, Math.max(0, vb.x + vb.w / 2)), cy = Math.min(VH, Math.max(0, vb.y + vb.h / 2)); vb.x = cx - vb.w / 2; vb.y = cy - vb.h / 2 }
  function setCW(cx, cy, w) { vb.w = w; vb.h = w / asp; vb.x = cx - w / 2; vb.y = cy - vb.h / 2; clamp(); apply() }
  let anim; function animTo(cx, cy, w) { cancelAnimationFrame(anim); const a = { cx: vb.x + vb.w / 2, cy: vb.y + vb.h / 2, w: vb.w }, t0 = performance.now()
    const stp = n => { const k = Math.min(1, (n - t0) / 420), e = 1 - Math.pow(1 - k, 3); setCW(a.cx + (cx - a.cx) * e, a.cy + (cy - a.cy) * e, a.w + (w - a.w) * e); if (k < 1) anim = requestAnimationFrame(stp) }; anim = requestAnimationFrame(stp) }
  const fitRect = (x, y, w, hh) => animTo(x + w / 2, y + hh / 2, Math.max(w + 60, (hh + 60) * asp))
  function fitAll(animasi) { const r = svg.getBoundingClientRect(); if (!r.width) return; asp = r.width / r.height
    const [cx, cy, w] = r.width < 600 ? [500, 375, 480] : [500, 375, Math.max(1060, 790 * asp)]; animasi ? animTo(cx, cy, w) : setCW(cx, cy, w) }
  function resize() { const r = svg.getBoundingClientRect(); if (!r.width) return; if (!fitted) { fitted = true; fitAll(false); return } const cx = vb.x + vb.w / 2, cy = vb.y + vb.h / 2; asp = r.width / r.height; setCW(cx, cy, vb.w) }
  function zoomAt(clx, cly, nw) { const r = svg.getBoundingClientRect(), fx = (clx - r.left) / r.width, fy = (cly - r.top) / r.height, px = vb.x + fx * vb.w, py = vb.y + fy * vb.h
    vb.w = Math.min(1600, Math.max(260, nw)); vb.h = vb.w / asp; vb.x = px - fx * vb.w; vb.y = py - fy * vb.h; clamp(); apply() }
  const ptr = new Map(); let drag = null, pinch = null
  svg.addEventListener('pointerdown', e => { ptr.set(e.pointerId, { x: e.clientX, y: e.clientY }); cancelAnimationFrame(anim)
    if (ptr.size === 1) drag = { x: e.clientX, y: e.clientY, vx: vb.x, vy: vb.y, moved: 0 }
    else if (ptr.size === 2) { const [a, b] = [...ptr.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), w: vb.w }; if (drag) drag.moved = 99 } })
  addEventListener('pointermove', e => { if (!ptr.has(e.pointerId)) return; ptr.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pinch && ptr.size >= 2) { const [a, b] = [...ptr.values()]; zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, pinch.w * pinch.d / Math.max(Math.hypot(a.x - b.x, a.y - b.y), 1)); return }
    if (drag) { const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.moved = Math.max(drag.moved, Math.hypot(dx, dy)); if (drag.moved > 5) { const k = vb.w / svg.getBoundingClientRect().width; vb.x = drag.vx - dx * k; vb.y = drag.vy - dy * k; clamp(); apply() } } })
  const up = e => { if (!ptr.has(e.pointerId)) return; ptr.delete(e.pointerId); if (drag && drag.moved > 5) { K.dragged = true; setTimeout(() => { K.dragged = false }, 60) }
    pinch = null; if (ptr.size === 1) { const p = [...ptr.values()][0]; drag = { x: p.x, y: p.y, vx: vb.x, vy: vb.y, moved: 99 } } else if (!ptr.size) drag = null }
  addEventListener('pointerup', up); addEventListener('pointercancel', up)
  svg.addEventListener('wheel', e => { e.preventDefault(); zoomAt(e.clientX, e.clientY, vb.w * Math.exp(e.deltaY * .0014)) }, { passive: false })
  $('#zIn').onclick = () => animTo(vb.x + vb.w / 2, vb.y + vb.h / 2, vb.w / 1.35)
  $('#zOut').onclick = () => animTo(vb.x + vb.w / 2, vb.y + vb.h / 2, vb.w * 1.35)
  $('#zFit').onclick = () => setFilt(null)
  if (window.ResizeObserver) new ResizeObserver(() => resize()).observe(svg)
  function setFilt(f) { filt = f || null; if (!filt) fitAll(true); else { const r = ROOMS.find(x => x.key === filt); if (r) fitRect(r.x, r.y, r.w, r.h) } update() }
  $('#kFilters').addEventListener('click', e => { const b = e.target.closest('[data-kf]'); if (b) setFilt(b.dataset.kf) })
  function focus(id) { const [x, y] = pos(id), r = svg.getBoundingClientRect(); animTo(x, y, r.width < 600 ? 360 : 560); $$('.ch', svg).forEach(g => g.classList.toggle('sel', g.dataset.id === id)) }
  return { update, resize, say: sayFn, focus, dragged: false }
})()

/* ---------- GRUP CHAT ---------- */
const CH = (() => {
  let ch = 'semua', sig = '', seen = 0
  const kanalOf = k => String(k.kanal || 'umum').trim().toLowerCase() || 'umum'
  function items() {
    const a = KABAR.map(k => ({ t: tms(k.waktu), kind: 'kabar', k, kanal: kanalOf(k), key: 'k' + k.id }))
    if (MODE === 'bos') {
      KEP.forEach(d => a.push({ t: tms(d.dibuat), kind: 'kep', d, kanal: 'meja-bos', key: 'd' + d.id }))
      ;[...PESAN, ...PESAN_LOKAL].forEach((p, i) => a.push({ t: tms(p.dibuat || p.waktu || p.created_at || p._t), kind: 'pesan', p, kanal: 'meja-bos', key: 'p' + (p.id ?? 'l' + i) }))
    }
    return a.filter(x => !isNaN(x.t)).sort((x, y) => x.t - y.t)
  }
  function channels(list) {
    const s = [...new Set(list.map(x => x.kanal))].filter(k => k !== 'meja-bos').sort()
    return ['semua', ...(MODE === 'bos' ? ['meja-bos'] : []), ...s]
  }
  const hari = t => { const d = new Date(t), n = new Date(); const a = new Date(d.getFullYear(), d.getMonth(), d.getDate()), b = new Date(n.getFullYear(), n.getMonth(), n.getDate()), diff = Math.round((b - a) / 864e5)
    return diff === 0 ? 'Hari ini' : diff === 1 ? 'Kemarin' : d.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'short' }) }
  function dcard(d) {
    const p = siapa(d.siapa)
    if (d.jawaban) return `<div class="dcard done"><b>${esc(d.judul)}</b>${d.isi ? `<p>${esc(d.isi)}</p>` : ''}<div class="ans">Lu jawab <b>${esc(d.jawaban)}</b>${d.dijawab ? ' · ' + jam(d.dijawab) : ''}${d.catatan_jawaban ? '<br>Catatan: ' + esc(d.catatan_jawaban) : ''}</div></div>`
    return `<div class="dcard"><b>${esc(d.judul)}</b>${d.isi ? `<p>${esc(d.isi)}</p>` : ''}<button class="btn pri" data-open-desk="${esc(d.id)}">Jawab di Meja bos</button></div>`
  }
  function render(force) {
    const list = items(), chs = channels(list)
    if (!chs.includes(ch)) ch = 'semua'
    const nb = list.length - seen
    $$('.nav .nb').forEach(b => { b.textContent = cur !== 'chat' && seen && nb > 0 ? Math.min(nb, 99) : '' })
    if (cur !== 'chat' && !force) return
    seen = list.length; $$('.nav .nb').forEach(b => { b.textContent = '' })
    const s = MODE + '|' + ch + '|' + list.map(x => x.key + (x.d ? x.d.jawaban : '')).join(',') + '|' + chs.join(',')
    const bos = MODE === 'bos'
    $('#composer').hidden = !bos; $('#guestNote').hidden = bos
    $('#chSub').textContent = bos ? 'Kabar tim, keputusan, dan pesan lu ke tim.' : 'Kabar dari tiap orang, urut waktu.'
    if (s === sig && !force) return
    const firstPaint = !sig; sig = s
    const lbl = c => c === 'semua' ? 'semua' : c
    $('#chans').innerHTML = '<div class="eyebrow">Kanal</div>' + chs.map(c => `<button class="chan" data-ch="${esc(c)}" aria-pressed="${c === ch}"><span class="h">#</span><span class="n">${esc(lbl(c))}</span></button>`).join('')
    $('#chanChips').innerHTML = chs.map(c => `<button class="chip" data-ch="${esc(c)}" aria-pressed="${c === ch}">#${esc(lbl(c))}</button>`).join('')
    $('#chTitle').textContent = '#' + lbl(ch)
    $('#chDesc').textContent = ch === 'semua' ? 'Semua kabar tim' : ch === 'meja-bos' ? 'Keputusan dan pesan lu ke tim' : 'Kabar kanal ' + ch
    const vis = list.filter(x => ch === 'semua' || x.kanal === ch).slice(-150)
    const box = $('#msgs'), near = firstPaint || force || box.scrollHeight - box.scrollTop - box.clientHeight < 140
    const old = new Set($$('[data-mk]', box).map(e => e.dataset.mk))
    let lastDay = '', lastWho = '', lastT = 0, html = ''
    vis.forEach(x => {
      const d = hari(x.t); if (d !== lastDay) { html += `<div class="day">${esc(d)}</div>`; lastDay = d; lastWho = '' }
      const isNew = old.size && !old.has(x.key) ? ' new' : ''
      if (x.kind === 'pesan') {
        const to = x.p.untuk ? byId(x.p.untuk) : null
        html += `<div class="msg me${isNew}" data-mk="${esc(x.key)}">${av('arya')}<div class="mb"><div class="mh"><b>Lu</b><span>ke ${esc(to ? nama(to) : 'tim')}</span><time>${jam(x.t)}</time></div><div class="mt">${esc(x.p.teks)}</div></div></div>`
        lastWho = 'arya'; return
      }
      const who = x.kind === 'kep' ? x.d.siapa : x.k.siapa, p = siapa(who), wid = p ? p.id : String(who || '?')
      const cont = wid === lastWho && x.t - lastT < 240000 && x.kind === 'kabar'
      lastWho = wid; lastT = x.t
      const kanalTag = ch === 'semua' && x.kind === 'kabar' ? `<span class="tagx">#${esc(x.kanal)}</span>` : x.kind === 'kep' ? '<span class="tagx">keputusan</span>' : ''
      const body = x.kind === 'kep' ? `<div class="mt">Butuh keputusan lu:</div>${dcard(x.d)}` : `<div class="mt">${esc(x.k.teks)}${kanalTag}</div>`
      html += `<div class="msg${cont ? ' cont' : ''}${isNew}" data-mk="${esc(x.key)}">${av(p)}<div class="mb"><div class="mh"><b>${esc(p ? nama(p) : who || 'Tanpa nama')}</b>${p && p.jabatan ? `<span>${esc(p.jabatan)}</span>` : ''}${x.kind === 'kep' ? kanalTag : ''}<time>${jam(x.t)}</time></div>${body}</div></div>`
    })
    box.innerHTML = html || `<div class="empty">${ERR ? esc(ERR) : LAST ? 'Belum ada kabar di kanal ini.' : 'Lagi ngambil kabar…'}</div>`
    if (near) box.scrollTop = box.scrollHeight
  }
  document.addEventListener('click', e => { const b = e.target.closest('[data-ch]'); if (b) { ch = b.dataset.ch; render(true) } })
  // ngetik ke tim
  const inp = $('#chatIn')
  const tujuan = v => TIM.find(p => p.id !== 'manajer' && p.nama && new RegExp('(^|[^\\p{L}])' + p.nama.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '($|[^\\p{L}])', 'iu').test(v)) || null
  inp.addEventListener('input', () => { const t = tujuan(inp.value); $('#toHint').innerHTML = t ? `Ke: <b>${esc(nama(t))}</b> (lewat Manajer)` : 'Ke: tim (lewat Manajer)' })
  $('#composer').addEventListener('submit', async e => {
    e.preventDefault(); const v = inp.value.trim(); if (!v || MODE !== 'bos') return
    const t = tujuan(v), btn = $('#chatSend'); btn.disabled = true
    try { await SRC.kirim(t ? t.id : null, v); inp.value = ''; $('#toHint').textContent = 'Ke: tim (lewat Manajer)'
      PESAN_LOKAL.push({ teks: v, untuk: t ? t.id : null, _t: Date.now() }); render(true)
      toast(t || byId('manajer'), t ? `Terkirim ke ${nama(t)}. Dibales di giliran Manajer berikutnya.` : 'Terkirim ke tim. Manajer bales di giliran berikutnya.')
      if (t) say(t.id, 'Ada pesan dari bos', true)
    } catch (er) { toast(null, 'Pesan gagal kekirim: ' + ((er && er.message) || 'coba lagi')) }
    btn.disabled = false
  })
  return { render }
})()

/* ---------- profil ---------- */
let openId = null
function personSvg(p) {
  const HAIR = ['M-8 -10a8 8 0 0 1 16 0v1h-16z', 'M-8.6 -10a8.6 8.6 0 0 1 17.2 0v10h-3.6v-8h-10v8h-3.6z', 'M-8 -10a8 8 0 0 1 16 0l-3 -1.5-3 2-3-2-3 2-4 -.5z']
  const hi = [...String(p.id)].reduce((a, c) => a + c.charCodeAt(0), 0) % 3
  return `<svg width="64" height="64" viewBox="-24 -26 48 48" aria-hidden="true" style="flex:none;background:var(--panel2);border-radius:18px"><rect x="-9.5" y="-2" width="19" height="17" rx="7" style="fill:${warna(p)}"/><circle cy="-10" r="8" style="fill:var(--skin)"/><path d="${HAIR[hi]}" style="fill:var(--hair)"/></svg>`
}
function renderProfile() {
  if (!openId) return
  const p = byId(openId); if (!p) { closeProfile(); return }
  const s = st(p.status), bos = MODE === 'bos', d = bos ? pending().find(x => { const q = siapa(x.siapa); return q && q.id === p.id }) : null
  const pr = typeof p.progres === 'number' ? Math.max(0, Math.min(100, p.progres)) : null
  const riw = kabarOrang(p.id).filter(k => new Date(k.waktu).toDateString() === new Date().toDateString()).slice(-12).reverse()
  const det = bos ? detail(p) : ''
  const html = `<div class="pf">${personSvg(p)}<div style="min-width:0"><h2>${esc(nama(p))}</h2><p>${esc(p.jabatan || '')}</p></div><button class="ib x" id="shClose" aria-label="Tutup"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>
    <div class="pills"><span class="pill"><i style="background:${s.c}"></i>${s.l}</span><span class="pill"><i style="background:${warna(p)}"></i>${esc(p.ruang || 'Lobi')}</span>${p.diperbarui ? `<span class="pill">diperbarui ${jam(p.diperbarui)}</span>` : ''}</div>
    <div class="now-box"><div class="eyebrow">Lagi ngerjain</div><b>${esc(p.tugas || (p.status === 'diam' ? 'Lagi ga ada tugas' : '-'))}</b>${det ? `<p class="det">${esc(det)}</p>` : ''}
      ${pr != null ? `<div class="pbar" style="--c:${warna(p)}"><i style="width:${pr}%"></i></div><div class="mono" style="font-size:11px;color:var(--ink3);margin-top:4px">${pr}%</div>` : ''}
      ${d ? `<button class="btn pri" style="margin-top:10px;width:100%" data-open-desk="${esc(d.id)}">Jawab: ${esc(potong(d.judul, 48))}</button>` : ''}</div>
    ${bos ? `<div class="acts"><button class="btn" data-act="colek">Colek</button><button class="btn" data-act="panggil">Panggil ke ruangan</button><button class="btn" data-act="pesan">Kirim pesan</button></div>` : `<div class="acts" style="grid-template-columns:1fr"><button class="btn" data-act="liat">Liat di kantor</button></div>`}
    <div><div class="eyebrow" style="margin-bottom:6px">Kabar hari ini · ${riw.length}</div><div class="hist" style="--c:${warna(p)}">${riw.map(k => `<div><time>${jam(k.waktu)}</time><span>${esc(k.teks)}</span></div>`).join('') || '<div><span>Belum ada kabar hari ini.</span></div>'}</div></div>`
  // gambar ulang cuma kalau isinya berubah, biar tombol ga ilang pas lagi diketuk
  if (html !== profSig) { profSig = html; $('#sheetIn').innerHTML = html }
}
let profSig = ''
function openProfile(id) { if (!byId(id)) return; closeDesk(true); openId = id; renderProfile(); $('#sheet').classList.add('on'); $('#sheet').setAttribute('aria-hidden', 'false'); if (innerWidth <= 860) $('#scrim').classList.add('on'); $$('.ch').forEach(g => g.classList.toggle('sel', g.dataset.id === id)) }
function closeProfile() { openId = null; profSig = ''; $('#sheet').classList.remove('on'); $('#sheet').setAttribute('aria-hidden', 'true'); if (!$('.modal.on')) $('#scrim').classList.remove('on'); $$('.ch').forEach(g => g.classList.remove('sel')) }
$('#sheet').addEventListener('click', async e => {
  if (e.target.closest('#shClose')) return closeProfile()
  const a = e.target.closest('[data-act]'); if (!a || !openId) return
  const p = byId(openId); if (!p) return
  const act = a.dataset.act
  if (act === 'liat') { closeProfile(); show('kantor'); setTimeout(() => K.focus(p.id), 80); return }
  if (act === 'pesan') { closeProfile(); show('chat'); const i = $('#chatIn'); i.value = nama(p) + ', '; i.dispatchEvent(new Event('input')); i.focus(); return }
  if (MODE !== 'bos') return
  const teks = act === 'colek' ? 'Colek dari bos' : 'Bos manggil ke Ruang Manajer'
  a.disabled = true
  try {
    await SRC.kirim(p.id, teks); PESAN_LOKAL.push({ teks, untuk: p.id, _t: Date.now() }); CH.render()
    if (act === 'colek') { say(p.id, 'Ya bos? Ada apa?', true); toast(p, `Lu colek ${nama(p)}`) }
    else { kunjungi(p.id, 'manajer', 9000); say(p.id, 'Otw ruangan, bos', true); toast(p, `${nama(p)} jalan ke Ruang Manajer`) }
  } catch (er) { toast(p, 'Gagal kekirim: ' + ((er && er.message) || 'coba lagi')) }
  a.disabled = false
})

/* ---------- meja bos ---------- */
let deskId = null
function openDesk(id) { if (MODE !== 'bos') return; closeProfile(); closeAuth(true); deskId = id || null; renderDesk(); $('#desk').classList.add('on'); $('#desk').setAttribute('aria-hidden', 'false'); $('#scrim').classList.add('on') }
function closeDesk(keep) { $('#desk').classList.remove('on'); $('#desk').setAttribute('aria-hidden', 'true'); if (!keep) $('#scrim').classList.remove('on') }
function renderDesk(errMsg) {
  const w = pending().slice().sort((a, b) => tms(a.dibuat) - tms(b.dibuat))
  const i = Math.max(0, w.findIndex(d => d.id === deskId)), d = w[i]
  if (d) deskId = d.id
  const done = KEP.filter(x => x.jawaban).sort((a, b) => tms(b.dijawab) - tms(a.dijawab)).slice(0, 3)
  const top = `<div class="mtop"><svg width="26" height="26" viewBox="0 0 24 24" style="fill:none;stroke:var(--accent);stroke-width:2;stroke-linejoin:round;flex:none"><path d="M3 13l2.5-8h13L21 13v6H3z"/><path d="M3 13h5l1.5 2.5h5L16 13h5"/></svg><div><h2>Meja bos</h2><div class="eyebrow">${w.length ? `${i + 1} dari ${w.length} nunggu lu` : 'Semua beres'}</div></div><div class="dots2">${w.slice(0, 12).map((_, k) => `<i class="${k === i ? 'on' : ''}"></i>`).join('')}</div><button class="ib x" id="dkClose" aria-label="Tutup"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>`
  let body
  if (d) {
    const p = siapa(d.siapa), opsi = Array.isArray(d.pilihan) && d.pilihan.length ? d.pilihan.map(String) : ['Setuju', 'Tolak']
    body = `<div class="ticket" id="tk"><div class="from">${av(p)}<div><b>${esc(p ? nama(p) : d.siapa || 'Tim')}</b><small>${esc(p && p.jabatan || '')} · masuk ${jam(d.dibuat)}</small></div></div><h3>${esc(d.judul)}</h3>${d.isi ? `<p>${esc(d.isi)}</p>` : ''}
      <textarea id="dkNote" maxlength="500" placeholder="Catatan buat ${esc(p ? nama(p) : 'tim')} (opsional)" aria-label="Catatan"></textarea>
      <div class="dopts">${opsi.map((o, k) => `<button class="btn ${k ? '' : 'pri'}" data-dk="${esc(d.id)}" data-opt="${esc(o)}">${esc(o)}</button>`).join('')}</div>
      ${errMsg ? `<p class="err">${esc(errMsg)}</p>` : ''}
      ${w.length > 1 ? `<button class="btn ghost skip" data-skip="${esc(w[(i + 1) % w.length].id)}">Lewatin dulu, liat berikutnya</button>` : ''}</div>`
  } else body = `<div class="clean"><h3>Meja bersih</h3><p>Ga ada yang nunggu keputusan lu. Tim jalan sendiri.</p></div>`
  const ans = done.length ? `<div class="answered"><div class="eyebrow">Udah lu jawab</div>${done.map(x => { const p = siapa(x.siapa); return `<div>${jam(x.dijawab)} · ${esc(p ? nama(p) : x.siapa)}: ${esc(x.judul)} → <b>${esc(x.jawaban)}</b></div>` }).join('')}</div>` : ''
  $('#deskIn').innerHTML = top + body + ans
  deskSig = KEP.map(x => x.id + ':' + (x.jawaban || '')).join(',')
}
$('#deskIn').addEventListener('click', async e => {
  if (e.target.closest('#dkClose')) return closeDesk()
  const s = e.target.closest('[data-skip]'); if (s) { deskId = s.dataset.skip; renderDesk(); return }
  const b = e.target.closest('[data-dk]'); if (!b) return
  const id = b.dataset.dk, opt = b.dataset.opt, note = ($('#dkNote') || {}).value || ''
  $$('[data-dk]').forEach(x => { x.disabled = true })
  try {
    await SRC.jawab(id, opt, note.trim())
    const d = KEP.find(x => x.id === id); if (d) Object.assign(d, { jawaban: opt, catatan_jawaban: note.trim() || null, dijawab: new Date().toISOString() })
    const p = d && siapa(d.siapa); if (p) { say(p.id, opt === (Array.isArray(d.pilihan) ? d.pilihan[0] : opt) ? 'Siap bos!' : 'Oke, dicatet', true); toast(p, `Keputusan ke ${nama(p)}: ${opt}`) }
    const tk = $('#tk'); if (tk) tk.classList.add('out')
    setTimeout(() => { const w = pending(); deskId = w[0] ? w[0].id : null; renderDesk(); renderHeader(); renderPulse(); CH.render() }, 260)
  } catch (er) { renderDesk((er && er.message) || 'Gagal nyimpen jawaban. Coba lagi.') }
})

/* ---------- masuk / akun ---------- */
let authBusy = false
const pesanAkun = e => { const m = (e && e.message) || String(e)
  if (/invalid login/i.test(m)) return 'Email atau kata sandi salah.'
  if (/not confirmed/i.test(m)) return 'Email belum dikonfirmasi.'
  if (/rate limit|too many|security purposes/i.test(m)) return 'Kebanyakan percobaan. Tunggu sebentar, terus coba lagi.'
  if (/fetch|network|load failed/i.test(m)) return 'Koneksi ke server bermasalah. Cek internet terus coba lagi.'
  return m }
function openAuth(msg) { closeProfile(); closeDesk(true); renderAuth(msg); $('#auth').classList.add('on'); $('#auth').setAttribute('aria-hidden', 'false'); $('#scrim').classList.add('on'); if (!USER) setTimeout(() => { const i = $('#auEmail'); i && i.focus() }, 260) }
function closeAuth(keep) { $('#auth').classList.remove('on'); $('#auth').setAttribute('aria-hidden', 'true'); if (!keep) $('#scrim').classList.remove('on') }
function renderAuth(msg) {
  const x = `<button class="ib x" data-au-close aria-label="Tutup"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button>`
  if (USER) { $('#authIn').innerHTML = `<div class="mtop"><div><h2>Akun bos</h2><div class="eyebrow">${MODE === 'bos' ? 'Mode bos aktif' : 'Mode tamu'}</div></div>${x}</div><p class="muted">Masuk sebagai <b>${esc(USER.email || '')}</b>.</p><button class="btn" data-au-out style="width:100%;height:44px">Keluar</button>`; return }
  $('#authIn').innerHTML = `<div class="mtop"><div><h2>Masuk</h2><div class="eyebrow">Cuma buat pemilik kantor</div></div>${x}</div>
    <p class="muted">Pakai akun get it yang sama kayak di Get a Job. Abis masuk, lu bisa jawab keputusan dan ngobrol sama tim.</p>
    <form class="form" id="auForm" novalidate><label for="auEmail">Email</label><input id="auEmail" type="email" autocomplete="email" inputmode="email" required>
    <label for="auPass">Kata sandi</label><input id="auPass" type="password" autocomplete="current-password" required>
    ${msg ? `<p class="err" role="status">${esc(msg)}</p>` : ''}<button class="btn pri" type="submit" ${authBusy ? 'disabled' : ''}>${authBusy ? 'Sebentar…' : 'Masuk'}</button></form>`
}
document.addEventListener('submit', async e => {
  if (e.target.id !== 'auForm') return; e.preventDefault(); if (authBusy) return
  const email = $('#auEmail').value.trim().toLowerCase(), pass = $('#auPass').value
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return renderAuth('Format email belum bener.')
  if (!pass) return renderAuth('Kata sandi belum diisi.')
  if (!DEMO && !sb) return renderAuth('Library login ga kebuka. Muat ulang halaman.')
  authBusy = true; renderAuth()
  try { USER = await SRC.masuk(email, pass); MODE = 'bos'; INFO = ''; FIRST = true; authBusy = false; closeAuth(); await tarik(); toast(byId('manajer'), MODE === 'bos' ? 'Selamat datang, bos.' : 'Masuk, tapi akun ini cuma dapet mode tamu.') }
  catch (er) { authBusy = false; renderAuth(pesanAkun(er)) }
})
$('#authIn').addEventListener('click', async e => {
  if (e.target.closest('[data-au-close]')) return closeAuth()
  if (e.target.closest('[data-au-out]')) { await SRC.keluar(); USER = null; MODE = 'tamu'; INFO = ''; FIRST = true; KEP = []; PESAN = []; PESAN_LOKAL = []; closeAuth(); await tarik(); toast(null, 'Udah keluar. Sekarang mode tamu.') }
})

/* ---------- event global ---------- */
document.addEventListener('click', e => {
  const nv = e.target.closest('[data-view]'); if (nv) { show(nv.dataset.view); return }
  const od = e.target.closest('[data-open-desk]'); if (od) { openDesk(od.dataset.openDesk || null); return }
  if (e.target.closest('[data-login]')) { openAuth(); return }
  if (e.target.closest('[data-retry]')) { tarik(); return }
  if (e.target.closest('[data-tutup-info]')) { INFO = ''; renderPulse(); return }
  if (e.target.closest('#sheet') || e.target.closest('.modal')) return
  const p = e.target.closest('[data-id]'); if (p && p.dataset.id) { if (e.target.closest('#floor') && K.dragged) return; openProfile(p.dataset.id) }
})
$('#btnMasuk').onclick = () => openAuth()
$('#btnAkun').onclick = () => openAuth()
$('#live').onclick = () => tarik()
$('#scrim').addEventListener('click', () => { closeProfile(); closeDesk(); closeAuth() })
addEventListener('keydown', e => { if (e.key === 'Escape') { closeProfile(); closeDesk(); closeAuth() } })
$('#btnTheme').onclick = () => { const dark = matchMedia('(prefers-color-scheme: dark)').matches, now = document.documentElement.dataset.theme || (dark ? 'dark' : 'light'), nx = now === 'dark' ? 'light' : 'dark'; document.documentElement.dataset.theme = nx; store.set('gio-tema', nx) }

/* ---------- jalan ---------- */
function jadwal() { clearInterval(pollT); pollT = setInterval(() => { if (document.visibilityState === 'visible') tarik() }, CFG.poll) }
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && Date.now() - LAST > 8000) tarik() })
addEventListener('online', () => tarik())
setInterval(renderLive, 1000)
async function mulai() {
  if (DEMO === 'bos') { MODE = 'bos'; USER = { email: 'contoh@lokal' } }
  else if (sb) {
    try { const { data } = await sb.auth.getSession(); const u = data && data.session && data.session.user; if (u) { USER = u; MODE = 'bos' } } catch (e) { }
    sb.auth.onAuthStateChange((ev, s) => { if (ev === 'SIGNED_OUT' && USER) { USER = null; MODE = 'tamu'; FIRST = true; KEP = []; tarik() } })
  }
  show(location.hash.slice(1) || 'kantor')
  render(); await tarik(); jadwal()
}
mulai()
