// Notif HP khusus mode bos. Alamat langganan disimpen di tabel office_langganan (cuma akun pemilik).
const NOTIF_OFF = {
  vapid: 'BJRnkwAP7TjvDPM7_LZ-7eoX--LrtVtdsan2SD9Ju6IyuiHQcpmA4yGO63P_ZOTOjh8SRF3Yowha5b0i18STkBw',
  fungsi: 'https://wtfshyfgcrglknogjgfb.supabase.co/functions/v1/kirim-notif-office',
}
const nUint8 = b => { const p = '='.repeat((4 - b.length % 4) % 4), s = atob((b + p).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(s, c => c.charCodeAt(0)) }
const nIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
const nTerpasang = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true
const nBisa = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window && isSecureContext
let nSibuk = false

async function nLangganan() { if (!nBisa()) return null; const r = await navigator.serviceWorker.getRegistration(); return r ? r.pushManager.getSubscription() : null }
async function nKeadaan() {
  if (!nBisa()) return nIOS() && !nTerpasang() ? 'ios' : 'ga-bisa'
  if (Notification.permission === 'denied') return 'diblok'
  const s = await nLangganan()
  return s && Notification.permission === 'granted' ? 'nyala' : 'mati'
}
async function nNyalain() {
  const izin = await Notification.requestPermission()
  if (izin !== 'granted') throw new Error(izin === 'denied' ? 'Notif diblok browser' : 'Notif belum diizinin')
  const reg = await navigator.serviceWorker.register('sw.js'); await navigator.serviceWorker.ready
  const sub = (await reg.pushManager.getSubscription()) || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: nUint8(NOTIF_OFF.vapid) }))
  const k = sub.toJSON().keys
  const { error } = await sb.from('office_langganan').upsert({ endpoint: sub.endpoint, p256dh: k.p256dh, auth: k.auth })
  if (error) throw error
  const { data } = await sb.auth.getSession(); const token = data && data.session && data.session.access_token
  if (token) fetch(NOTIF_OFF.fungsi, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify({ mode: 'tes' }) }).catch(() => { })
}
async function nMatiin() {
  const s = await nLangganan()
  if (s) { await sb.from('office_langganan').delete().eq('endpoint', s.endpoint); await s.unsubscribe().catch(() => { }) }
}
async function segarNotifOffice() {
  const box = document.getElementById('notifBox'); if (!box) return
  if (typeof DEMO !== 'undefined' && DEMO) { box.innerHTML = '<p class="muted">Notif HP ga aktif di mode tiruan.</p>'; return }
  const st = await nKeadaan().catch(() => 'ga-bisa')
  const teks = {
    nyala: ['Notif HP nyala', 'Balasan Manajer dan keputusan baru bakal masuk ke HP ini.', '<button class="btn" data-notif-off="mati" style="width:100%;height:44px">Matiin notif</button>'],
    mati: ['Notif HP', 'Dapet kabar pas Manajer bales atau ada keputusan baru, walau halaman ini ditutup.', '<button class="btn pri" data-notif-off="nyala" style="width:100%;height:44px">Nyalain notif</button>'],
    diblok: ['Notif diblok', 'Buka pengaturan situs di browser, izinin notifikasi, terus muat ulang.', ''],
    ios: ['Di iPhone, pasang ke Layar Utama dulu', 'Buka di Safari, Bagikan, Tambah ke Layar Utama, terus buka get it office dari ikonnya dan nyalain notif dari sini.', ''],
    'ga-bisa': ['Browser ini belum bisa nerima notif', 'Coba Chrome, Edge, atau Safari terbaru.', ''],
  }[st]
  box.innerHTML = `<div class="notif-bos"><b>${teks[0]}</b><p class="muted">${teks[1]}</p>${teks[2]}</div>`
}
document.addEventListener('click', async e => {
  const b = e.target.closest('[data-notif-off]'); if (!b || nSibuk) return
  nSibuk = true; b.disabled = true
  try {
    if (b.dataset.notifOff === 'nyala') { await nNyalain(); toast(byId('manajer'), 'Notif nyala. Cek HP, harusnya ada notif tes barusan.') }
    else { await nMatiin(); toast(byId('manajer'), 'Notif HP dimatiin.') }
  } catch (er) { toast(byId('manajer'), (er && er.message) || 'Gagal ngatur notif. Coba lagi bentar.') }
  nSibuk = false; segarNotifOffice()
})
