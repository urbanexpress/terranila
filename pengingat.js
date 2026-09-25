/* =====================================================================
 * TERRANILA BOOK — PENGINGAT JADWAL PAKAN (alarm dalam aplikasi)
 *
 * Membunyikan nada khas saat jam pemberian pakan yang diisi di form
 * kolam tiba, selama aplikasi sedang dibuka.
 *
 * Batas yang disengaja: alarm ini TIDAK berbunyi saat aplikasi ditutup.
 * Pengingat saat aplikasi tertutup butuh Web Push beserta server
 * penjadwal, dan suaranya pun akan memakai nada bawaan sistem, bukan
 * nada khas. Jadi fitur ini sengaja dibatasi pada yang benar-benar bisa
 * dijanjikan browser.
 * ===================================================================== */
(function () {
    'use strict';

    const KUNCI = 'terr_alarm_pakan';          // nilai: 'on' atau 'off'
    const JEDA_CEK = 30000;                    // cek tiap 30 detik
    const TOLERANSI_MENIT = 2;                 // masih dibunyikan bila telat ≤ 2 menit

    let ctxAudio = null;
    let audioSiap = false;
    const sudahBunyi = new Set();              // kunci: 'YYYY-MM-DD|HH:MM'

    const alarmAktif = () => localStorage.getItem(KUNCI) !== 'off';

    /* ---------- Suara ---------- */

    // Nada dibangkitkan Web Audio, bukan berkas MP3. Alasannya: tidak
    // menambah berkas untuk diunduh, tetap berbunyi saat offline, dan
    // tidak ada risiko berkas audio gagal dimuat dari CDN.
    function siapkanAudio() {
        if (audioSiap) return;
        try {
            const AC = window.AudioContext || window.webkitAudioContext;
            if (!AC) return;
            ctxAudio = new AC();
            audioSiap = true;
        } catch (e) {
            console.warn('Audio tidak tersedia:', e);
        }
    }

    // Browser melarang suara otomatis sebelum pengguna menyentuh halaman.
    // Sentuhan pertama apa pun dipakai untuk menyalakan mesin audionya.
    ['click', 'touchstart', 'keydown'].forEach(ev => {
        document.addEventListener(ev, function bukaSekali() {
            siapkanAudio();
            if (ctxAudio && ctxAudio.state === 'suspended') ctxAudio.resume();
            ['click', 'touchstart', 'keydown'].forEach(e2 => document.removeEventListener(e2, bukaSekali));
        }, { once: true, passive: true });
    });

    function nada(frek, mulai, durasi, volume) {
        const osc = ctxAudio.createOscillator();
        const gain = ctxAudio.createGain();
        osc.type = 'sine';
        osc.frequency.value = frek;
        // Volume dinaikkan dan diturunkan landai supaya tidak ada bunyi
        // "klik" di ujung nada.
        gain.gain.setValueAtTime(0.0001, mulai);
        gain.gain.exponentialRampToValueAtTime(volume, mulai + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, mulai + durasi);
        osc.connect(gain);
        gain.connect(ctxAudio.destination);
        osc.start(mulai);
        osc.stop(mulai + durasi + 0.02);
    }

    // Pola khas: tiga ketukan naik, diulang dua kali. Cukup menonjol untuk
    // terdengar di tepi kolam, tapi bukan sirene.
    window.bunyikanAlarmPakan = function () {
        siapkanAudio();
        if (!ctxAudio) return false;
        if (ctxAudio.state === 'suspended') ctxAudio.resume();
        // resume() berjalan asinkron. Kalau statusnya belum 'running', nada
        // yang dijadwalkan tidak akan terdengar, dan pemanggil perlu tahu itu
        // supaya bisa memberi tahu pengguna, bukan mengira alarm sudah bunyi.
        if (ctxAudio.state !== 'running') return false;
        const t = ctxAudio.currentTime + 0.05;
        const pola = [880, 1108, 1318];
        for (let ulang = 0; ulang < 2; ulang++) {
            pola.forEach((f, i) => nada(f, t + ulang * 0.9 + i * 0.18, 0.16, 0.25));
        }
        // Getaran ikut dinyalakan bila perangkat mendukung, untuk HP yang disenyapkan.
        if (navigator.vibrate) { try { navigator.vibrate([200, 100, 200]); } catch (e) {} }
        return true;
    };

    /* ---------- Penjadwalan ---------- */

    function menitDari(hhmm) {
        const p = String(hhmm).split(':');
        if (p.length < 2) return null;
        const j = parseInt(p[0], 10), m = parseInt(p[1], 10);
        if (!isFinite(j) || !isFinite(m)) return null;
        return j * 60 + m;
    }

    function cekJadwal() {
        if (!alarmAktif()) return;
        // Hanya saat pengguna benar-benar masuk. Kalau tidak, alarm bisa
        // berbunyi di layar login dengan data sisa dari sesi sebelumnya.
        if (!document.documentElement.classList.contains('is-logged-in')) return;

        let kolamList = [], detail = {};
        try { kolamList = dbKolam || []; } catch (e) { return; }
        try { detail = dbDetailKolam || {}; } catch (e) { return; }

        const now = new Date();
        const hariIni = now.toISOString().split('T')[0];
        const menitSekarang = now.getHours() * 60 + now.getMinutes();

        // Kumpulkan semua kolam yang jadwalnya jatuh pada menit ini, supaya
        // tiga kolam berjadwal sama menghasilkan satu pop-up, bukan tiga.
        const jatuhTempo = {};
        kolamList.forEach(k => {
            const d = detail[k];
            if (!d || !Array.isArray(d.waktuPakan)) return;
            d.waktuPakan.forEach(wp => {
                const menitJadwal = menitDari(wp);
                if (menitJadwal === null) return;
                const selisih = menitSekarang - menitJadwal;
                if (selisih < 0 || selisih > TOLERANSI_MENIT) return;
                const kunci = hariIni + '|' + wp;
                if (sudahBunyi.has(kunci + '|' + k)) return;
                sudahBunyi.add(kunci + '|' + k);
                if (!jatuhTempo[wp]) jatuhTempo[wp] = [];
                jatuhTempo[wp].push(k);
            });
        });

        const jamJatuh = Object.keys(jatuhTempo);
        if (!jamJatuh.length) return;

        const berbunyi = window.bunyikanAlarmPakan();
        const pesan = jamJatuh.map(j => 'Pukul ' + j + ' WIB — ' + jatuhTempo[j].join(', ')).join('\n');
        const tambahan = berbunyi ? '' : '\n\n(Suara belum bisa dibunyikan karena halaman belum disentuh sejak dibuka.)';
        if (window.showCustomAlert) {
            window.showCustomAlert('⏰ Waktunya memberi pakan\n\n' + pesan + tambahan);
        }
    }

    /* ---------- Tombol nyala/mati di halaman Akun ---------- */

    window.perbaruiLabelAlarm = function () {
        const el = document.getElementById('label-alarm-pakan');
        if (!el) return;
        const on = alarmAktif();
        el.innerText = on ? 'Aktif' : 'Nonaktif';
        el.className = on
            ? 'text-xs font-bold text-emerald-600'
            : 'text-xs font-bold text-slate-400';
    };

    window.toggleAlarmPakan = function () {
        const baru = alarmAktif() ? 'off' : 'on';
        localStorage.setItem(KUNCI, baru);
        window.perbaruiLabelAlarm();
        if (baru === 'on') {
            window.bunyikanAlarmPakan();
            if (window.showCustomAlert) window.showCustomAlert('Pengingat pakan dinyalakan.\nNada di atas adalah contoh bunyinya.\n\nAlarm hanya berbunyi selama aplikasi ini terbuka.');
        } else {
            if (window.showCustomAlert) window.showCustomAlert('Pengingat pakan dimatikan.');
        }
    };

    document.addEventListener('DOMContentLoaded', () => {
        window.perbaruiLabelAlarm();
        cekJadwal();
        setInterval(cekJadwal, JEDA_CEK);
    });
})();
