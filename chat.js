/* =====================================================================
 * TERRANILA BOOK — HALAMAN CATAT (mode obrolan)
 *
 * Pintu masuk sederhana untuk petani yang bingung dengan banyak tombol:
 * pilih nomor menu, formulir ringkas muncul di dalam obrolan.
 *
 * Aturan penting bagi siapa pun yang melanjutkan berkas ini:
 * JANGAN menulis logika penyimpanan baru di sini. Berkas ini hanya
 * mengisi kolom pada formulir yang sudah ada di index.html, lalu
 * memanggil fungsi simpan aslinya (simpanMonitoring, simpanKeuangan).
 * Dengan begitu validasi stok, pengurangan inventory, sinkronisasi ke
 * Supabase, dan perbaikan apa pun di masa depan berlaku otomatis di
 * kedua jalur, dan tidak ada dua versi aturan yang diam-diam berbeda.
 * ===================================================================== */
(function () {
    'use strict';

    const hariIni = () => new Date().toISOString().split('T')[0];
    const jamIni = () => new Date().toTimeString().slice(0, 5);
    const rupiah = (n) => 'Rp ' + Math.round(n || 0).toLocaleString('id-ID');

    /* ---------- Bantuan mengisi formulir lama ---------- */

    function isi(id, nilai) {
        const el = document.getElementById(id);
        if (el) el.value = nilai;
    }

    // Select pada formulir lama diisi lewat JavaScript saat modalnya dibuka.
    // Karena modal itu tidak kita buka, pilihannya bisa saja belum ada, dan
    // menyetel .value ke pilihan yang tidak ada akan gagal diam-diam.
    // Jadi pilihannya ditambahkan dulu bila belum ada.
    function isiSelect(id, nilai) {
        const el = document.getElementById(id);
        if (!el) return;
        if (nilai && !Array.from(el.options).some(o => o.value === nilai)) {
            el.add(new Option(nilai, nilai));
        }
        el.value = nilai;
    }

    // Fungsi simpan yang lama melapor lewat pop-up. Di sini pop-up itu
    // dibajak sementara supaya pesannya muncul sebagai gelembung obrolan,
    // bukan sebagai jendela yang menutupi percakapan.
    function panggilSimpan(fn) {
        const asli = window.showCustomAlert;
        const pesan = [];
        window.showCustomAlert = (t) => pesan.push(String(t));
        try { fn(); } catch (e) { pesan.push('Terjadi kesalahan: ' + (e && e.message ? e.message : e)); }
        window.showCustomAlert = asli;
        return pesan;
    }

    const jumlahData = () => {
        let a = 0, b = 0;
        try { a = (dbMonitoring || []).length; } catch (e) {}
        try { b = (dbKeuangan || []).length; } catch (e) {}
        return a + b;
    };

    /* ---------- Gelembung obrolan ---------- */

    function areaChat() { return document.getElementById('chat-isi'); }

    function gulirKeBawah() {
        const a = areaChat();
        if (a) a.scrollTop = a.scrollHeight;
    }

    function bubbleBot(html) {
        const a = areaChat();
        if (!a) return null;
        const w = document.createElement('div');
        w.className = 'flex gap-2 mb-3';
        w.innerHTML = '<div class="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center text-sm shrink-0"><i class="fas fa-fish"></i></div>'
                    + '<div class="bg-white border border-slate-200 rounded-2xl rounded-tl-sm p-3 max-w-[85%] text-sm text-slate-700 shadow-sm">' + html + '</div>';
        a.appendChild(w);
        gulirKeBawah();
        return w;
    }

    function bubbleUser(teks) {
        const a = areaChat();
        if (!a) return;
        const w = document.createElement('div');
        w.className = 'flex justify-end mb-3';
        w.innerHTML = '<div class="bg-blue-600 text-white rounded-2xl rounded-tr-sm px-4 py-2 max-w-[85%] text-sm">' + teks + '</div>';
        a.appendChild(w);
        gulirKeBawah();
    }

    // Formulir yang sudah dikirim dikunci, supaya tidak ada orang yang
    // menekan Simpan dua kali pada gelembung lama dan membuat data ganda.
    function kunciBubble(el, catatan) {
        if (!el) return;
        el.querySelectorAll('input, select, button, textarea').forEach(x => { x.disabled = true; });
        el.style.opacity = '0.6';
        if (catatan) {
            const p = document.createElement('p');
            p.className = 'text-[11px] text-slate-400 mt-2';
            p.innerText = catatan;
            el.querySelector('div:last-child').appendChild(p);
        }
    }

    /* ---------- Menu ---------- */

    const MENU = [
        { no: 1, ikon: 'fa-utensils',       judul: 'Catat pemberian pakan & monitoring', fn: 'formMonitoring' },
        { no: 2, ikon: 'fa-arrow-trend-down', judul: 'Catat pengeluaran',                fn: 'formKeluar' },
        { no: 3, ikon: 'fa-arrow-trend-up',   judul: 'Catat pemasukan',                  fn: 'formMasuk' },
        { no: 4, ikon: 'fa-skull',            judul: 'Catat ikan mati',                  fn: 'formMati' },
        { no: 5, ikon: 'fa-clipboard-list',   judul: 'Lihat ringkasan hari ini',         fn: 'tampilRingkasan' }
    ];

    function tampilkanMenu() {
        let html = '<p class="mb-2">Mau catat apa? Tekan nomornya.</p><div class="space-y-1.5">';
        MENU.forEach(m => {
            html += '<button onclick="window.chatPilihMenu(' + m.no + ')" class="w-full flex items-center gap-3 text-left bg-slate-50 hover:bg-blue-50 border border-slate-200 rounded-xl px-3 py-2.5 transition">'
                  + '<span class="w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center shrink-0">' + m.no + '</span>'
                  + '<span class="text-sm text-slate-700">' + m.judul + '</span></button>';
        });
        html += '</div>';
        bubbleBot(html);
    }

    function daftarKolam() {
        try { return dbKolam || []; } catch (e) { return []; }
    }

    function opsiKolam() {
        const k = daftarKolam();
        return '<option value="">-- Pilih kolam --</option>' + k.map(x => '<option value="' + x + '">' + x + '</option>').join('');
    }

    function opsiPakanStok() {
        let inv = {};
        try { inv = dbInventory || {}; } catch (e) {}
        const nama = Object.keys(inv);
        if (!nama.length) return '';
        return '<option value="">-- Tidak beri pakan --</option>'
             + nama.map(b => {
                 const sisa = (inv[b].beli || 0) - (inv[b].pakai || 0);
                 return '<option value="' + b + '">' + b + ' (sisa ' + sisa.toLocaleString('id-ID') + ' kg)</option>';
               }).join('');
    }

    const KELAS_INPUT = 'w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white mb-2';

    window.chatPilihMenu = function (no) {
        const m = MENU.find(x => x.no === no);
        if (!m) return;
        bubbleUser(m.no + '. ' + m.judul);

        if (no !== 5 && !daftarKolam().length) {
            bubbleBot('Belum ada kolam yang terdaftar. Buat kolam dulu di halaman Beranda, baru catatannya bisa diisi di sini.');
            return;
        }
        FORM[m.fn]();
    };

    /* ---------- Formulir di dalam obrolan ---------- */

    const FORM = {};

    FORM.formMonitoring = function () {
        const pakan = opsiPakanStok();
        const html =
            '<p class="font-bold text-slate-800 mb-2">Catatan harian</p>'
          + '<select data-f="kolam" class="' + KELAS_INPUT + '">' + opsiKolam() + '</select>'
          + '<input type="date" data-f="tgl" value="' + hariIni() + '" class="' + KELAS_INPUT + '">'
          + '<div class="grid grid-cols-3 gap-2">'
          + '<input type="number" step="0.1" data-f="suhu" placeholder="Suhu °C" class="' + KELAS_INPUT + '">'
          + '<input type="number" step="0.1" data-f="ph" placeholder="pH" class="' + KELAS_INPUT + '">'
          + '<input type="number" step="0.1" data-f="do" placeholder="DO" class="' + KELAS_INPUT + '">'
          + '</div>'
          + '<input type="number" data-f="mati" placeholder="Ikan mati (ekor)" class="' + KELAS_INPUT + '">'
          + '<input type="number" step="0.1" data-f="bio" placeholder="Perkiraan berat total ikan (kg)" class="' + KELAS_INPUT + '">'
          + '<p class="text-[11px] text-slate-400 -mt-1 mb-2">Isi saat menimbang sampling. Angka ini yang dipakai menghitung pertumbuhan dan FCR.</p>'
          + (pakan
              ? '<select data-f="brand" class="' + KELAS_INPUT + '">' + pakan + '</select>'
                + '<input type="number" step="0.1" data-f="kg" placeholder="Pakan diberikan (kg)" class="' + KELAS_INPUT + '">'
              : '<p class="text-[11px] text-slate-400 mb-2">Belum ada stok pakan. Catat pembelian pakan lewat menu 2 dulu bila ingin mencatat pemberian pakan.</p>')
          + '<button onclick="window.chatSimpanMonitoring(this)" class="w-full bg-blue-600 text-white font-bold py-2.5 rounded-xl text-sm">Simpan</button>'
          + '<p class="text-[11px] text-slate-400 mt-2">Kolom yang tidak diisi akan dilewati. Butuh isian lengkap seperti biomassa? <button onclick="window.chatBukaFormLengkap()" class="text-blue-600 underline">Buka formulir lengkap</button></p>';
        bubbleBot(html);
    };

    FORM.formMati = function () {
        const html =
            '<p class="font-bold text-slate-800 mb-2">Catat ikan mati</p>'
          + '<select data-f="kolam" class="' + KELAS_INPUT + '">' + opsiKolam() + '</select>'
          + '<input type="date" data-f="tgl" value="' + hariIni() + '" class="' + KELAS_INPUT + '">'
          + '<input type="number" data-f="jml" placeholder="Jumlah ekor" class="' + KELAS_INPUT + '">'
          + '<button onclick="window.chatSimpanMati(this)" class="w-full bg-blue-600 text-white font-bold py-2.5 rounded-xl text-sm">Simpan</button>';
        bubbleBot(html);
    };

    FORM.formMasuk = function () {
        const html =
            '<p class="font-bold text-slate-800 mb-2">Catat pemasukan</p>'
          + '<select data-f="kolam" class="' + KELAS_INPUT + '">' + opsiKolam() + '</select>'
          + '<input type="date" data-f="tgl" value="' + hariIni() + '" class="' + KELAS_INPUT + '">'
          + '<select data-f="kat" class="' + KELAS_INPUT + '"><option value="Penjualan">Penjualan</option><option value="Lainnya">Lainnya</option></select>'
          + '<input type="number" data-f="nominal" placeholder="Nominal Rp" class="' + KELAS_INPUT + '">'
          + '<input type="text" data-f="ket" placeholder="Keterangan (opsional)" class="' + KELAS_INPUT + '">'
          + '<button onclick="window.chatSimpanKeuangan(this, \'masuk\')" class="w-full bg-blue-600 text-white font-bold py-2.5 rounded-xl text-sm">Simpan</button>';
        bubbleBot(html);
    };

    FORM.formKeluar = function () {
        let brandHtml = '';
        try {
            const unik = [];
            (dbPakan || []).forEach(p => { if (!unik.includes(p.brand)) unik.push(p.brand); });
            brandHtml = unik.map(b => '<option value="' + b + '">' + b + '</option>').join('');
        } catch (e) {}

        const html =
            '<p class="font-bold text-slate-800 mb-2">Catat pengeluaran</p>'
          + '<select data-f="kolam" class="' + KELAS_INPUT + '">' + opsiKolam() + '</select>'
          + '<input type="date" data-f="tgl" value="' + hariIni() + '" class="' + KELAS_INPUT + '">'
          + '<select data-f="kat" onchange="window.chatCekKategori(this)" class="' + KELAS_INPUT + '">'
          + (brandHtml ? '<option value="Pakan">Beli pakan (masuk stok)</option>' : '')
          + '<option value="Operasional">Operasional</option><option value="Benih">Benih</option></select>'
          + '<div data-f="area-pakan" class="' + (brandHtml ? '' : 'hidden') + '">'
          + '<select data-f="brand" class="' + KELAS_INPUT + '">' + brandHtml + '</select>'
          + '<div class="grid grid-cols-2 gap-2">'
          + '<input type="number" step="0.1" data-f="kg" placeholder="Jumlah kg" class="' + KELAS_INPUT + '">'
          + '<input type="number" data-f="harga" placeholder="Harga per kg" class="' + KELAS_INPUT + '">'
          + '</div></div>'
          + '<input type="number" data-f="nominal" placeholder="Nominal Rp" class="' + KELAS_INPUT + (brandHtml ? ' hidden' : '') + '">'
          + '<input type="text" data-f="ket" placeholder="Keterangan (opsional)" class="' + KELAS_INPUT + '">'
          + '<button onclick="window.chatSimpanKeuangan(this, \'keluar\')" class="w-full bg-blue-600 text-white font-bold py-2.5 rounded-xl text-sm">Simpan</button>';
        bubbleBot(html);
    };

    window.chatCekKategori = function (sel) {
        const bubble = sel.closest('.flex');
        const area = bubble.querySelector('[data-f="area-pakan"]');
        const nom = bubble.querySelector('[data-f="nominal"]');
        const pakan = sel.value === 'Pakan';
        if (area) area.classList.toggle('hidden', !pakan);
        // Untuk pembelian pakan, nominal dihitung dari kg × harga, sama seperti
        // di formulir lama, supaya total dan stok tidak bisa berbeda.
        if (nom) nom.classList.toggle('hidden', pakan);
    };

    window.chatBukaFormLengkap = function () {
        window.tutupChatCatat();
        if (window.bukaModalMonitoring) window.bukaModalMonitoring();
    };

    /* ---------- Penyimpanan (memakai fungsi lama) ---------- */

    function laporkanHasil(bubbleEl, sebelum, pesan, ringkas) {
        const berhasil = jumlahData() > sebelum;
        kunciBubble(bubbleEl, berhasil ? 'Sudah disimpan' : null);
        if (berhasil) {
            bubbleBot('<p class="text-emerald-600 font-bold"><i class="fas fa-check-circle"></i> Tersimpan</p><p class="mt-1">' + ringkas + '</p>');
            setTimeout(tampilkanMenu, 300);
        } else {
            const teks = pesan.length ? pesan.join('<br>') : 'Data belum tersimpan. Periksa kembali isiannya.';
            bubbleBot('<p class="text-red-600 font-bold"><i class="fas fa-circle-exclamation"></i> Belum tersimpan</p><p class="mt-1">' + teks + '</p>');
            if (bubbleEl) {
                bubbleEl.querySelectorAll('input, select, button').forEach(x => { x.disabled = false; });
                bubbleEl.style.opacity = '1';
            }
        }
    }

    window.chatSimpanMonitoring = function (btn) {
        const bubble = btn.closest('.flex');
        // Kolom dibaca relatif terhadap gelembung ini. Gelembung obrolan lain
        // punya kolom bernama sama, dan pencarian global akan mengambil
        // formulir tertua yang sudah terkunci.
        const f = (nama) => bubble.querySelector('[data-f="' + nama + '"]');
        const kolam = f('kolam').value;
        if (!kolam) return bubbleBot('Pilih kolamnya dulu ya.');

        const brandEl = f('brand');
        const kgEl = f('kg');
        const brand = brandEl ? brandEl.value : '';
        const kgTeks = kgEl ? kgEl.value : '';

        isiSelect('monitoring-kolam', kolam);
        isi('monitoring-tanggal', f('tgl').value || hariIni());
        isi('monitoring-waktu', jamIni());
        isi('monitoring-suhu', f('suhu').value);
        isi('monitoring-ph', f('ph').value);
        isi('monitoring-do', f('do').value);
        isi('monitoring-mortalitas', f('mati').value);
        isi('monitoring-biomassa', f('bio').value);
        isiSelect('monitoring-pakan-brand', brand);
        isi('monitoring-pakan-takaran', kgTeks);

        const sebelum = jumlahData();
        const pesan = panggilSimpan(() => simpanMonitoring());

        const bagian = [];
        if (f('suhu').value) bagian.push('suhu ' + f('suhu').value + '°C');
        if (f('mati').value) bagian.push('mati ' + f('mati').value + ' ekor');
        if (brand && kgTeks) bagian.push('pakan ' + kgTeks + ' kg (' + brand + ')');
        if (f('bio').value) bagian.push('biomassa ' + f('bio').value + ' kg');
        laporkanHasil(bubble, sebelum, pesan, kolam + (bagian.length ? ' — ' + bagian.join(', ') : ''));
    };

    window.chatSimpanMati = function (btn) {
        const bubble = btn.closest('.flex');
        // Kolom dibaca relatif terhadap gelembung ini. Gelembung obrolan lain
        // punya kolom bernama sama, dan pencarian global akan mengambil
        // formulir tertua yang sudah terkunci.
        const f = (nama) => bubble.querySelector('[data-f="' + nama + '"]');
        const kolam = f('kolam').value;
        const jml = f('jml').value;
        if (!kolam) return bubbleBot('Pilih kolamnya dulu ya.');
        if (!jml || parseFloat(jml) <= 0) return bubbleBot('Isi jumlah ekor yang mati.');

        isiSelect('monitoring-kolam', kolam);
        isi('monitoring-tanggal', f('tgl').value || hariIni());
        isi('monitoring-waktu', jamIni());
        ['monitoring-suhu', 'monitoring-ph', 'monitoring-do', 'monitoring-biomassa', 'monitoring-pakan-takaran'].forEach(id => isi(id, ''));
        isiSelect('monitoring-pakan-brand', '');
        isi('monitoring-mortalitas', jml);

        const sebelum = jumlahData();
        const pesan = panggilSimpan(() => simpanMonitoring());
        laporkanHasil(bubble, sebelum, pesan, kolam + ' — ' + jml + ' ekor mati');
    };

    window.chatSimpanKeuangan = function (btn, tipe) {
        const bubble = btn.closest('.flex');
        // Kolom dibaca relatif terhadap gelembung ini. Gelembung obrolan lain
        // punya kolom bernama sama, dan pencarian global akan mengambil
        // formulir tertua yang sudah terkunci.
        const f = (nama) => bubble.querySelector('[data-f="' + nama + '"]');
        const kolam = f('kolam').value;
        const kat = f('kat').value;
        const ket = f('ket').value;
        const tgl = f('tgl').value || hariIni();

        // Radio dan daftar kategori pada formulir lama disiapkan oleh
        // updateKategoriKeuangan(), jadi urutannya harus sama: pilih tipe,
        // bangun ulang kategori, baru set kategorinya.
        const radio = document.querySelector('input[name="tipe_uang"][value="' + tipe + '"]');
        if (radio) radio.checked = true;
        if (window.updateKategoriKeuangan) updateKategoriKeuangan();
        isiSelect('keuangan-kategori', kat);
        if (window.cekKategoriPakan) cekKategoriPakan();

        isi('keuangan-tanggal', tgl);
        isiSelect('keuangan-kolam', kolam);
        isi('keuangan-keterangan', ket);

        let ringkas = '';
        if (tipe === 'keluar' && kat === 'Pakan') {
            const brand = f('brand').value;
            const kg = f('kg').value;
            const harga = f('harga').value;
            if (!brand || !kg || !harga) return bubbleBot('Lengkapi merek, jumlah kg, dan harga per kg.');

            // Pilihan merek pada formulir lama memakai harga sebagai value dan
            // nama merek sebagai teks, jadi dicocokkan lewat teksnya.
            const sel = document.getElementById('keuangan-pakan-brand');
            let ketemu = false;
            if (sel) {
                for (let i = 0; i < sel.options.length; i++) {
                    if (sel.options[i].text === brand) { sel.selectedIndex = i; ketemu = true; break; }
                }
            }
            if (!ketemu) return bubbleBot('Merek pakan "' + brand + '" tidak ditemukan di daftar. Coba lewat formulir Keuangan biasa.');
            isi('keuangan-pakan-kg', kg);
            isi('keuangan-pakan-harga', harga);
            if (window.kalkulasiTotalPakan) kalkulasiTotalPakan();
            ringkas = 'Beli ' + kg + ' kg ' + brand + ' — ' + rupiah(parseFloat(kg) * parseFloat(harga));
        } else {
            const nominal = f('nominal').value;
            if (!nominal || parseFloat(nominal) <= 0) return bubbleBot('Isi nominalnya dulu ya.');
            isi('keuangan-nominal', nominal);
            ringkas = (tipe === 'masuk' ? 'Pemasukan ' : 'Pengeluaran ') + rupiah(parseFloat(nominal)) + ' — ' + kat + (kolam ? ' (' + kolam + ')' : '');
        }

        const sebelum = jumlahData();
        const pesan = panggilSimpan(() => simpanKeuangan());
        laporkanHasil(bubble, sebelum, pesan, ringkas);
    };

    /* ---------- Ringkasan hari ini ---------- */

    FORM.tampilRingkasan = function () {
        const t = hariIni();
        let mon = [], keu = [];
        try { mon = (dbMonitoring || []).filter(x => x.tgl === t); } catch (e) {}
        try { keu = (dbKeuangan || []).filter(x => x.tgl === t); } catch (e) {}

        if (!mon.length && !keu.length) {
            bubbleBot('Belum ada catatan hari ini. Pilih menu 1 sampai 4 untuk mulai mencatat.');
            setTimeout(tampilkanMenu, 300);
            return;
        }

        const pakan = mon.reduce((a, x) => a + (parseFloat(x.takaran) || 0), 0);
        const mati = mon.reduce((a, x) => a + (parseFloat(x.mort) || 0), 0);
        const masuk = keu.filter(x => x.tipe === 'masuk').reduce((a, x) => a + (parseFloat(x.jml) || 0), 0);
        const keluar = keu.filter(x => x.tipe === 'keluar').reduce((a, x) => a + (parseFloat(x.jml) || 0), 0);

        let html = '<p class="font-bold text-slate-800 mb-2">Ringkasan ' + t + '</p><ul class="space-y-1">';
        html += '<li>Catatan monitoring: <b>' + mon.length + '</b></li>';
        html += '<li>Pakan diberikan: <b>' + pakan.toLocaleString('id-ID') + ' kg</b></li>';
        html += '<li>Ikan mati: <b>' + mati.toLocaleString('id-ID') + ' ekor</b></li>';
        html += '<li>Pemasukan: <b>' + rupiah(masuk) + '</b></li>';
        html += '<li>Pengeluaran: <b>' + rupiah(keluar) + '</b></li>';
        html += '</ul>';
        bubbleBot(html);
        setTimeout(tampilkanMenu, 300);
    };

    /* ---------- Buka & tutup halaman ---------- */

    function pastikanHalaman() {
        if (document.getElementById('chat-catat')) return;
        const el = document.createElement('div');
        el.id = 'chat-catat';
        el.className = 'hidden fixed inset-0 z-[520] bg-slate-100 flex flex-col';
        el.innerHTML =
            '<div class="bg-blue-600 text-white px-4 py-3 flex items-center gap-3 shrink-0" style="padding-top:calc(0.75rem + env(safe-area-inset-top,0px))">'
          + '<button onclick="window.tutupChatCatat()" class="w-9 h-9 rounded-full hover:bg-blue-700 flex items-center justify-center"><i class="fas fa-arrow-left"></i></button>'
          + '<div><p class="font-bold leading-tight">Catat Cepat</p><p class="text-[11px] text-blue-100">Pilih nomor, isi, selesai</p></div>'
          + '<button onclick="window.setModeInput(\'pro\'); window.tutupChatCatat();" class="ml-auto text-[11px] bg-blue-700 hover:bg-blue-800 px-2.5 py-1.5 rounded-lg">Mode Pro</button>'
          + '</div>'
          + '<div id="chat-isi" class="flex-1 overflow-y-auto p-4"></div>'
          + '<div class="bg-white border-t border-slate-200 px-4 py-2 text-center shrink-0" style="padding-bottom:calc(0.5rem + env(safe-area-inset-bottom,0px))">'
          + '<button onclick="window.chatUlangMenu()" class="text-blue-600 text-xs font-bold"><i class="fas fa-rotate-right"></i> Tampilkan menu lagi</button>'
          + '</div>';
        document.body.appendChild(el);
    }

    window.chatUlangMenu = function () { tampilkanMenu(); };

    window.bukaChatCatat = function () {
        pastikanHalaman();
        const isiEl = areaChat();
        if (isiEl && !isiEl.innerHTML.trim()) {
            let nama = '';
            try { nama = (JSON.parse(localStorage.getItem('terr_active')) || {}).nama || ''; } catch (e) {}
            bubbleBot('Halo' + (nama ? ' ' + nama : '') + '. Saya bantu catat data kolam Anda.');
            tampilkanMenu();
        }
        document.getElementById('chat-catat').classList.remove('hidden');
    };

    /* ---------- Mode input: Pemula atau Pro ---------- */
    // Hanya mengubah pintu masuk pencatatan. Kolom yang tersimpan, validasi,
    // dan seluruh indikator sama persis di kedua mode, karena keduanya
    // memanggil fungsi simpan yang sama.
    // Disimpan per perangkat (localStorage), bukan per akun, supaya satu
    // pengurus bisa memakai mode berbeda di HP-nya sendiri.
    const KUNCI_MODE = 'terr_mode_input';

    window.modeInput = function () {
        return localStorage.getItem(KUNCI_MODE) === 'pro' ? 'pro' : 'pemula';
    };

    // Tombol + di tengah navigasi bawah.
    window.tombolTambahUtama = function () {
        if (window.modeInput() === 'pro') {
            if (window.bukaModalMonitoring) return bukaModalMonitoring();
        }
        window.bukaChatCatat();
    };

    window.setModeInput = function (mode) {
        localStorage.setItem(KUNCI_MODE, mode === 'pro' ? 'pro' : 'pemula');
        window.perbaruiLabelMode();
        if (window.showCustomAlert) {
            window.showCustomAlert(mode === 'pro'
                ? 'Mode Pro aktif.\nTombol + langsung membuka formulir monitoring. Mode obrolan tetap bisa dibuka dari halaman Akun.'
                : 'Mode Pemula aktif.\nTombol + membuka menu obrolan bernomor. Semua formulir lama tetap bisa dipakai seperti biasa.');
        }
    };

    window.perbaruiLabelMode = function () {
        const pro = window.modeInput() === 'pro';
        const bp = document.getElementById('btn-mode-pemula');
        const bo = document.getElementById('btn-mode-pro');
        const aktif = 'flex-1 py-2 rounded-lg text-xs font-bold bg-blue-600 text-white';
        const mati = 'flex-1 py-2 rounded-lg text-xs font-bold bg-slate-100 text-slate-500';
        if (bp) bp.className = pro ? mati : aktif;
        if (bo) bo.className = pro ? aktif : mati;
    };

    document.addEventListener('DOMContentLoaded', () => window.perbaruiLabelMode());

    window.tutupChatCatat = function () {
        const el = document.getElementById('chat-catat');
        if (el) el.classList.add('hidden');
    };
})();
