/* =====================================================================
 * TERRANILA BOOK — MODUL LAPORAN PDF
 * Berkas terpisah dari index.html supaya perbaikan laporan tidak
 * berisiko merusak aplikasi utama.
 *
 * Membaca variabel global milik index.html: dbKolam, dbDetailKolam,
 * dbMonitoring, dbKeuangan, dbInventory, dbRiwayatPanen,
 * dbLaporanPenjualan. Variabel itu baru ada setelah aplikasi dimuat,
 * jadi semuanya hanya disentuh di dalam fungsi, bukan saat berkas ini
 * dimuat.
 * ===================================================================== */
(function () {
    'use strict';

    // Versi dipaku, bukan "latest". Pustaka yang berubah sendiri di belakang
    // layar pernah membuat fitur mati tanpa ada perubahan kode.
    const URL_JSPDF = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.2/jspdf.umd.min.js';
    const URL_AUTOTABLE = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js';

    const WARNA = {
        biru: [37, 99, 235],
        biruMuda: [219, 234, 254],
        hijau: [16, 185, 129],
        merah: [220, 38, 38],
        oranye: [234, 88, 12],
        abu: [100, 116, 139],
        abuMuda: [241, 245, 249],
        garis: [203, 213, 225],
        hitam: [30, 41, 59]
    };

    /* ---------- Bantuan umum ---------- */

    function muatScript(url) {
        return new Promise((resolve, reject) => {
            if (document.querySelector('script[data-src="' + url + '"]')) return resolve();
            const s = document.createElement('script');
            s.src = url;
            s.async = true;
            s.setAttribute('data-src', url);
            s.onload = () => resolve();
            s.onerror = () => reject(new Error('Gagal memuat ' + url));
            document.head.appendChild(s);
        });
    }

    async function siapkanPustaka() {
        if (!(window.jspdf && window.jspdf.jsPDF)) await muatScript(URL_JSPDF);
        if (!(window.jspdf && window.jspdf.jsPDF)) throw new Error('Pustaka PDF tidak terbaca.');
        // autoTable menempel sebagai method pada prototype jsPDF
        if (typeof window.jspdf.jsPDF.API.autoTable !== 'function') await muatScript(URL_AUTOTABLE);
        if (typeof window.jspdf.jsPDF.API.autoTable !== 'function') throw new Error('Pustaka tabel PDF tidak terbaca.');
    }

    const angka = (n) => (isFinite(n) ? n : 0);
    const rp = (n) => 'Rp ' + Math.round(angka(n)).toLocaleString('id-ID');
    const kg = (n) => angka(n).toLocaleString('id-ID', { maximumFractionDigits: 1 }) + ' kg';
    const num = (n, d) => angka(n).toLocaleString('id-ID', { maximumFractionDigits: d === undefined ? 2 : d });
    // FCR selalu 2 desimal supaya "1" tidak terbaca berbeda dari "1,00"
    const fcr = (n) => angka(n).toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    function tglIndo(iso) {
        if (!iso) return '-';
        const b = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
        const p = String(iso).split('-');
        if (p.length !== 3) return iso;
        return parseInt(p[2], 10) + ' ' + (b[parseInt(p[1], 10) - 1] || p[1]) + ' ' + p[0];
    }

    // Tanggal di aplikasi ini selalu berformat YYYY-MM-DD, jadi perbandingan
    // string sudah benar secara urutan dan tidak perlu objek Date sama sekali.
    const dalamRentang = (t, dari, sampai) => !!t && t >= dari && t <= sampai;

    // Mengambil angka kg dari teks seperti "Nila: 120 kg"
    function kgDariTeks(arr) {
        if (!Array.isArray(arr)) return 0;
        return arr.reduce((tot, s) => {
            const m = String(s).match(/([\d.,]+)\s*kg/i);
            if (!m) return tot;
            return tot + (parseFloat(m[1].replace(/\./g, '').replace(',', '.')) || 0);
        }, 0);
    }

    function angkaDariTeks(arr) {
        if (!Array.isArray(arr)) return 0;
        return arr.reduce((tot, s) => {
            const m = String(s).match(/:\s*([\d.,]+)/);
            if (!m) return tot;
            return tot + (parseFloat(m[1].replace(/\./g, '').replace(',', '.')) || 0);
        }, 0);
    }

    const G = (nama, fallback) => (typeof window[nama] !== 'undefined' ? window[nama] : fallback);

    /* ---------- Pengumpulan & perhitungan data ---------- */

    function kumpulkanData(dari, sampai) {
        // Variabel global index.html dideklarasikan dengan let, jadi diakses
        // langsung (bukan lewat window) dan dibungkus try agar tidak meledak
        // kalau modul ini dipakai di halaman lain.
        let kolamList = [], detail = {}, monitoring = [], keuangan = [], inventory = {}, panen = [], jual = [];
        try { kolamList = dbKolam || []; } catch (e) {}
        try { detail = dbDetailKolam || {}; } catch (e) {}
        try { monitoring = dbMonitoring || []; } catch (e) {}
        try { keuangan = dbKeuangan || []; } catch (e) {}
        try { inventory = dbInventory || {}; } catch (e) {}
        try { panen = dbRiwayatPanen || []; } catch (e) {}
        try { jual = dbLaporanPenjualan || []; } catch (e) {}

        const mon = monitoring.filter(m => dalamRentang(m.tgl, dari, sampai));
        const keu = keuangan.filter(t => dalamRentang(t.tgl, dari, sampai));
        const pan = panen.filter(p => dalamRentang(p.tgl, dari, sampai));
        const jul = jual.filter(j => dalamRentang(j.tgl, dari, sampai));

        const perKolam = kolamList.map(k => {
            const d = detail[k] || {};
            const mK = mon.filter(m => m.kolam === k);
            const pK = pan.filter(p => p.kolam === k);
            const jK = jul.filter(j => j.klm === k);

            const pakanKg = mK.reduce((a, m) => a + angka(parseFloat(m.takaran)), 0);
            const biayaPakan = mK.reduce((a, m) => {
                const h = inventory[m.brand] ? angka(inventory[m.brand].harga) : 0;
                return a + angka(parseFloat(m.takaran)) * h;
            }, 0);
            const mortMonitoring = mK.reduce((a, m) => a + angka(parseFloat(m.mort)), 0);
            const panenKg = pK.reduce((a, p) => a + kgDariTeks(p.bStr), 0);
            const panenEkor = pK.reduce((a, p) => a + angkaDariTeks(p.eStr), 0);
            const matiPanen = pK.reduce((a, p) => a + angkaDariTeks(p.mStr), 0);

            const suhu = mK.filter(m => angka(parseFloat(m.suhu)) > 0).map(m => parseFloat(m.suhu));
            const ph = mK.filter(m => angka(parseFloat(m.ph)) > 0).map(m => parseFloat(m.ph));
            const doAir = mK.filter(m => angka(parseFloat(m.doAir)) > 0).map(m => parseFloat(m.doAir));
            const rata = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);

            const masuk = keu.filter(t => t.kolam === k && t.tipe === 'masuk').reduce((a, t) => a + angka(t.jml), 0);
            const keluar = keu.filter(t => t.kolam === k && t.tipe === 'keluar').reduce((a, t) => a + angka(t.jml), 0);

            const tebar = Array.isArray(d.tebarArr)
                ? d.tebarArr.reduce((a, x) => a + angka(parseFloat(x)), 0)
                : angka(parseFloat(d.tebar));

            const fcrTargetArr = Array.isArray(d.fcrArr)
                ? d.fcrArr.map(x => parseFloat(x)).filter(x => isFinite(x) && x > 0)
                : [];
            const fcrTarget = fcrTargetArr.length ? fcrTargetArr.reduce((a, b) => a + b, 0) / fcrTargetArr.length : null;

            const terjualKg = jK.filter(j => /kg/i.test(j.st || '')).reduce((a, j) => a + angka(parseFloat(j.jm)), 0);
            const nilaiJual = jK.reduce((a, j) => a + angka(parseFloat(j.tot)), 0);

            const tglTerakhirMonitoring = mK.length ? mK.map(m => m.tgl).sort().slice(-1)[0] : null;

            return {
                nama: k, jenis: d.jenisStr || '-', lokasi: d.lok || '-',
                luas: angka(parseFloat(d.luas)), tglBuat: d.tglBuat || null,
                tebar: tebar, pakanKg: pakanKg, biayaPakan: biayaPakan,
                mortMonitoring: mortMonitoring, matiPanen: matiPanen,
                panenKg: panenKg, panenEkor: panenEkor,
                fcrAktual: panenKg > 0 ? pakanKg / panenKg : null,
                fcrTarget: fcrTarget,
                suhu: rata(suhu), ph: rata(ph), doAir: rata(doAir),
                doMin: doAir.length ? Math.min.apply(null, doAir) : null,
                jumlahCatatan: mK.length, masuk: masuk, keluar: keluar,
                terjualKg: terjualKg, nilaiJual: nilaiJual,
                tglTerakhirMonitoring: tglTerakhirMonitoring
            };
        });

        const totalMasuk = keu.filter(t => t.tipe === 'masuk').reduce((a, t) => a + angka(t.jml), 0);
        const totalKeluar = keu.filter(t => t.tipe === 'keluar').reduce((a, t) => a + angka(t.jml), 0);

        const perKategori = {};
        keu.forEach(t => {
            const kunci = (t.tipe === 'masuk' ? 'Masuk — ' : 'Keluar — ') + (t.kat || 'Lainnya');
            if (!perKategori[kunci]) perKategori[kunci] = { tipe: t.tipe, jumlah: 0, transaksi: 0 };
            perKategori[kunci].jumlah += angka(t.jml);
            perKategori[kunci].transaksi += 1;
        });

        // Rekap keuangan per bulan, untuk grafik
        const perBulan = {};
        keu.forEach(t => {
            const b = String(t.tgl).slice(0, 7);
            if (!perBulan[b]) perBulan[b] = { masuk: 0, keluar: 0 };
            perBulan[b][t.tipe === 'masuk' ? 'masuk' : 'keluar'] += angka(t.jml);
        });

        const stok = Object.keys(inventory).map(b => ({
            brand: b,
            beli: angka(inventory[b].beli),
            pakai: angka(inventory[b].pakai),
            sisa: angka(inventory[b].beli) - angka(inventory[b].pakai),
            harga: angka(inventory[b].harga)
        }));

        return {
            dari: dari, sampai: sampai, perKolam: perKolam,
            monitoring: mon, keuangan: keu, panen: pan, penjualan: jul,
            totalMasuk: totalMasuk, totalKeluar: totalKeluar,
            laba: totalMasuk - totalKeluar,
            perKategori: perKategori, perBulan: perBulan, stok: stok,
            totalPanenKg: perKolam.reduce((a, k) => a + k.panenKg, 0),
            totalPakanKg: perKolam.reduce((a, k) => a + k.pakanKg, 0),
            totalMortalitas: perKolam.reduce((a, k) => a + k.mortMonitoring, 0),
            totalTerjualKg: perKolam.reduce((a, k) => a + k.terjualKg, 0),
            totalNilaiJual: perKolam.reduce((a, k) => a + k.nilaiJual, 0)
        };
    }

    /* ---------- Analisa berbasis aturan ---------- */
    // Semua kesimpulan di bawah berasal dari perbandingan angka, bukan tebakan.
    // Kalau datanya tidak cukup, aturan sengaja diam daripada mengarang.

    function buatAnalisa(D) {
        const hasil = [];
        const tambah = (tag, teks) => hasil.push({ tag: tag, teks: teks });

        const adaData = D.keuangan.length || D.monitoring.length || D.panen.length;
        if (!adaData) {
            tambah('info', 'Tidak ada satu pun catatan pada rentang tanggal ini. Laporan hanya berisi kerangka kosong — coba perlebar rentang tanggalnya.');
            return hasil;
        }

        // 1. Laba / rugi
        if (D.totalMasuk === 0 && D.totalKeluar > 0) {
            tambah('perhatian', 'Belum ada pemasukan tercatat pada periode ini, sementara pengeluaran mencapai ' + rp(D.totalKeluar) + '. Wajar bila kolam masih dalam masa pembesaran dan belum panen.');
        } else if (D.laba < 0) {
            tambah('buruk', 'Arus kas periode ini minus ' + rp(Math.abs(D.laba)) + '. Pengeluaran melebihi pemasukan.');
        } else if (D.laba > 0) {
            const margin = D.totalMasuk > 0 ? (D.laba / D.totalMasuk) * 100 : 0;
            tambah('baik', 'Arus kas periode ini positif ' + rp(D.laba) + ', setara margin ' + num(margin, 1) + '% dari pemasukan.');
        }

        // 2. FCR per kolam terhadap target
        D.perKolam.forEach(k => {
            if (k.fcrAktual === null) return;
            if (k.fcrTarget === null) {
                tambah('info', k.nama + ': FCR aktual ' + fcr(k.fcrAktual) + '. Target FCR belum diisi, jadi belum bisa dinilai baik atau buruk.');
                return;
            }
            const selisih = ((k.fcrAktual - k.fcrTarget) / k.fcrTarget) * 100;
            if (selisih > 10) {
                tambah('buruk', k.nama + ': FCR aktual ' + fcr(k.fcrAktual) + ' meleset ' + num(selisih, 0) + '% di atas target ' + fcr(k.fcrTarget) + '. Artinya pakan yang dihabiskan lebih banyak daripada rencana untuk tiap kg ikan.');
            } else if (selisih < -5) {
                tambah('baik', k.nama + ': FCR aktual ' + fcr(k.fcrAktual) + ' lebih hemat ' + num(Math.abs(selisih), 0) + '% dari target ' + fcr(k.fcrTarget) + '.');
            } else {
                tambah('baik', k.nama + ': FCR aktual ' + fcr(k.fcrAktual) + ' sesuai target ' + fcr(k.fcrTarget) + '.');
            }
        });

        // 3. Mortalitas terhadap jumlah tebar
        D.perKolam.forEach(k => {
            const mati = k.mortMonitoring + k.matiPanen;
            if (!k.tebar || mati === 0) return;
            const persen = (mati / k.tebar) * 100;
            if (persen >= 15) {
                tambah('buruk', k.nama + ': kematian tercatat ' + num(mati, 0) + ' ekor atau ' + num(persen, 1) + '% dari ' + num(k.tebar, 0) + ' ekor tebar. Periksa kualitas air dan kepadatan.');
            } else if (persen >= 8) {
                tambah('perhatian', k.nama + ': kematian ' + num(persen, 1) + '% dari jumlah tebar. Masih wajar, tapi layak diawasi.');
            }
        });

        // 4. Kualitas air di luar rentang umum budidaya nila
        D.perKolam.forEach(k => {
            if (k.suhu !== null && (k.suhu < 25 || k.suhu > 32)) {
                tambah('perhatian', k.nama + ': rata-rata suhu ' + num(k.suhu, 1) + '°C, di luar rentang nyaman nila (25–32°C).');
            }
            if (k.ph !== null && (k.ph < 6.5 || k.ph > 8.5)) {
                tambah('perhatian', k.nama + ': rata-rata pH ' + num(k.ph, 1) + ', di luar rentang aman (6,5–8,5).');
            }
            if (k.doAir !== null && k.doAir < 3) {
                tambah('buruk', k.nama + ': rata-rata oksigen terlarut hanya ' + num(k.doAir, 1) + ' mg/L. Di bawah 3 mg/L ikan mudah stres dan mati.');
            } else if (k.doMin !== null && k.doMin < 3) {
                // Rata-rata bisa menyembunyikan satu hari yang berbahaya,
                // jadi nilai terendah ikut diperiksa terpisah.
                tambah('perhatian', k.nama + ': rata-rata oksigen terlarut aman, tetapi pernah tercatat serendah ' + num(k.doMin, 1) + ' mg/L.');
            }
        });

        // 5. Kolam yang lama tidak dicatat
        D.perKolam.forEach(k => {
            if (k.jumlahCatatan === 0) {
                tambah('perhatian', k.nama + ': tidak ada catatan monitoring sama sekali pada periode ini. Angka FCR dan pakan untuk kolam ini otomatis tidak bisa dihitung.');
                return;
            }
            const selisihHari = Math.round((new Date(D.sampai) - new Date(k.tglTerakhirMonitoring)) / 86400000);
            if (selisihHari >= 7) {
                tambah('perhatian', k.nama + ': catatan monitoring terakhir ' + tglIndo(k.tglTerakhirMonitoring) + ', sudah ' + selisihHari + ' hari sebelum akhir periode.');
            }
        });

        // 6. Stok pakan
        D.stok.forEach(s => {
            if (s.sisa <= 0) {
                tambah('perhatian', 'Stok ' + s.brand + ' habis. Pemberian pakan berikutnya akan ditolak aplikasi sampai stok ditambah.');
            } else if (s.sisa < 10) {
                tambah('info', 'Stok ' + s.brand + ' tinggal ' + num(s.sisa, 1) + ' kg.');
            }
        });

        // 7. Porsi biaya pakan
        const totalBiayaPakan = D.perKolam.reduce((a, k) => a + k.biayaPakan, 0);
        if (D.totalKeluar > 0 && totalBiayaPakan > 0) {
            const porsi = (totalBiayaPakan / D.totalKeluar) * 100;
            tambah('info', 'Nilai pakan yang benar-benar terpakai ' + rp(totalBiayaPakan) + '. Sebagai pembanding, total pengeluaran kas tercatat ' + rp(D.totalKeluar) + '.');
            if (porsi > 100) {
                // Terjadi bila pakan yang diberikan berasal dari stok yang
                // dibeli sebelum periode ini. Persentasenya tidak bermakna,
                // jadi sengaja tidak ditampilkan sebagai angka.
                tambah('info', 'Pakan yang diberikan periode ini sebagian berasal dari stok pembelian sebelumnya, jadi nilainya melebihi pengeluaran kas periode ini.');
            } else if (porsi > 70) {
                tambah('perhatian', 'Pakan mendominasi biaya (' + num(porsi, 0) + '% dari pengeluaran). Efisiensi FCR akan sangat menentukan untung rugi.');
            }
        }

        // 8. Harga jual rata-rata
        if (D.totalTerjualKg > 0) {
            const hargaRata = D.totalNilaiJual / D.totalTerjualKg;
            tambah('info', 'Harga jual rata-rata ' + rp(hargaRata) + ' per kg, dari ' + kg(D.totalTerjualKg) + ' yang terjual.');
        }

        // 9. Panen belum terjual
        const selisihPanenJual = D.totalPanenKg - D.totalTerjualKg;
        if (D.totalPanenKg > 0 && selisihPanenJual > 0.5) {
            tambah('info', kg(selisihPanenJual) + ' hasil panen belum tercatat terjual. Bisa berarti stok masih ada, atau penjualannya belum dicatat.');
        }

        return hasil;
    }

    /* ---------- Menggambar grafik langsung di PDF ---------- */
    // Tidak memakai html2canvas: mengubah HTML jadi gambar sering gagal karena
    // warna CSS modern, dan hasilnya buram saat dicetak. Menggambar batang
    // sendiri jauh lebih kecil risikonya dan hasilnya tajam.

    function gambarBatang(doc, opt) {
        const { x, y, w, h, labels, series, formatNilai } = opt;
        const padKiri = 8, padBawah = 18, padAtas = 14;
        const areaW = w - padKiri, areaH = h - padBawah - padAtas;
        const dasarY = y + padAtas + areaH;

        let maks = 0;
        series.forEach(s => s.data.forEach(v => { if (v > maks) maks = v; }));
        if (maks <= 0) maks = 1;

        // Garis bantu horizontal
        doc.setDrawColor(...WARNA.garis);
        doc.setLineWidth(0.5);
        for (let i = 0; i <= 3; i++) {
            const gy = dasarY - (areaH / 3) * i;
            doc.line(x + padKiri, gy, x + w, gy);
            doc.setFontSize(6);
            doc.setTextColor(...WARNA.abu);
            doc.text(formatNilai ? formatNilai(maks / 3 * i) : num(maks / 3 * i, 0), x + padKiri - 4, gy - 1, { align: 'right' });
        }

        const nGrup = labels.length || 1;
        const lebarGrup = areaW / nGrup;
        const lebarBatang = Math.min(14, (lebarGrup * 0.7) / series.length);

        labels.forEach((lb, i) => {
            const gx = x + padKiri + lebarGrup * i + (lebarGrup - lebarBatang * series.length) / 2;
            series.forEach((s, j) => {
                const nilai = angka(s.data[i]);
                const tinggi = (nilai / maks) * areaH;
                doc.setFillColor(...s.warna);
                if (tinggi > 0) doc.rect(gx + lebarBatang * j, dasarY - tinggi, lebarBatang, tinggi, 'F');
            });
            doc.setFontSize(6.5);
            doc.setTextColor(...WARNA.hitam);
            const teks = String(lb).length > 12 ? String(lb).slice(0, 11) + '.' : String(lb);
            doc.text(teks, x + padKiri + lebarGrup * i + lebarGrup / 2, dasarY + 9, { align: 'center' });
        });

        // Keterangan warna
        let lx = x + padKiri;
        series.forEach(s => {
            doc.setFillColor(...s.warna);
            doc.rect(lx, y + 2, 7, 7, 'F');
            doc.setFontSize(7);
            doc.setTextColor(...WARNA.hitam);
            doc.text(s.nama, lx + 10, y + 8);
            lx += doc.getTextWidth(s.nama) + 26;
        });
    }

    /* ---------- Penyusunan PDF ---------- */

    function judulBagian(doc, teks, y) {
        doc.setFillColor(...WARNA.biruMuda);
        doc.rect(40, y - 11, 515, 16, 'F');
        doc.setFontSize(10);
        doc.setTextColor(...WARNA.biru);
        doc.setFont(undefined, 'bold');
        doc.text(teks, 46, y);
        doc.setFont(undefined, 'normal');
        return y + 18;
    }

    function ruangCukup(doc, y, butuh) {
        if (y + butuh > 780) { doc.addPage(); return 60; }
        return y;
    }

    async function buatPdf(dari, sampai) {
        await siapkanPustaka();
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ unit: 'pt', format: 'a4' });

        const D = kumpulkanData(dari, sampai);
        const analisa = buatAnalisa(D);

        let akun = {};
        try { akun = JSON.parse(localStorage.getItem('terr_active')) || {}; } catch (e) {}

        /* --- Sampul ringkas --- */
        doc.setFillColor(...WARNA.biru);
        doc.rect(0, 0, 595, 86, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(18);
        doc.setFont(undefined, 'bold');
        doc.text('Laporan Budidaya', 40, 40);
        doc.setFont(undefined, 'normal');
        doc.setFontSize(10);
        doc.text('Terranila Book', 40, 58);
        doc.setFontSize(9);
        doc.text('Periode ' + tglIndo(dari) + ' s/d ' + tglIndo(sampai), 40, 74);
        doc.text((akun.usaha || akun.nama || '-'), 555, 58, { align: 'right' });
        doc.setFontSize(7.5);
        doc.text('Dicetak ' + new Date().toLocaleString('id-ID'), 555, 74, { align: 'right' });

        let y = 118;

        /* --- Ringkasan angka --- */
        y = judulBagian(doc, 'RINGKASAN PERIODE', y);
        doc.autoTable({
            startY: y,
            theme: 'grid',
            styles: { fontSize: 8.5, cellPadding: 5, textColor: WARNA.hitam, lineColor: WARNA.garis },
            columnStyles: { 0: { fontStyle: 'bold', fillColor: WARNA.abuMuda, cellWidth: 150 }, 2: { fontStyle: 'bold', fillColor: WARNA.abuMuda, cellWidth: 150 } },
            body: [
                ['Total pemasukan', rp(D.totalMasuk), 'Total panen', kg(D.totalPanenKg)],
                ['Total pengeluaran', rp(D.totalKeluar), 'Total terjual', kg(D.totalTerjualKg)],
                ['Selisih kas', rp(D.laba), 'Nilai penjualan', rp(D.totalNilaiJual)],
                ['Pakan terpakai', kg(D.totalPakanKg), 'Kematian tercatat', num(D.totalMortalitas, 0) + ' ekor'],
                ['Jumlah kolam', num(D.perKolam.length, 0) + ' kolam', 'Catatan monitoring', num(D.monitoring.length, 0) + ' catatan']
            ]
        });
        y = doc.lastAutoTable.finalY + 24;

        /* --- Grafik keuangan per bulan --- */
        const bulanKunci = Object.keys(D.perBulan).sort();
        if (bulanKunci.length) {
            y = ruangCukup(doc, y, 170);
            y = judulBagian(doc, 'ARUS KAS PER BULAN', y);
            gambarBatang(doc, {
                x: 40, y: y, w: 515, h: 130,
                labels: bulanKunci.map(b => tglIndo(b + '-01').replace(/^\d+ /, '')),
                series: [
                    { nama: 'Pemasukan', warna: WARNA.hijau, data: bulanKunci.map(b => D.perBulan[b].masuk) },
                    { nama: 'Pengeluaran', warna: WARNA.merah, data: bulanKunci.map(b => D.perBulan[b].keluar) }
                ],
                formatNilai: (v) => (v >= 1000000 ? (v / 1000000).toFixed(1) + ' jt' : Math.round(v / 1000) + ' rb')
            });
            y += 150;
        }

        /* --- Grafik pakan vs panen per kolam --- */
        const kolamAdaData = D.perKolam.filter(k => k.pakanKg > 0 || k.panenKg > 0);
        if (kolamAdaData.length) {
            y = ruangCukup(doc, y, 170);
            y = judulBagian(doc, 'PAKAN TERPAKAI vs HASIL PANEN PER KOLAM', y);
            gambarBatang(doc, {
                x: 40, y: y, w: 515, h: 130,
                labels: kolamAdaData.map(k => k.nama),
                series: [
                    { nama: 'Pakan (kg)', warna: WARNA.oranye, data: kolamAdaData.map(k => k.pakanKg) },
                    { nama: 'Panen (kg)', warna: WARNA.biru, data: kolamAdaData.map(k => k.panenKg) }
                ],
                formatNilai: (v) => num(v, 0)
            });
            y += 150;
        }

        /* --- Performa per kolam --- */
        y = ruangCukup(doc, y, 120);
        y = judulBagian(doc, 'PERFORMA PER KOLAM', y);
        doc.autoTable({
            startY: y,
            theme: 'striped',
            headStyles: { fillColor: WARNA.biru, fontSize: 7.5 },
            styles: { fontSize: 7.5, cellPadding: 4, lineColor: WARNA.garis },
            head: [['Kolam', 'Jenis', 'Tebar', 'Pakan', 'Panen', 'FCR', 'Target', 'Mati', 'Masuk', 'Keluar']],
            body: D.perKolam.length ? D.perKolam.map(k => [
                k.nama, k.jenis, num(k.tebar, 0),
                num(k.pakanKg, 1), num(k.panenKg, 1),
                k.fcrAktual === null ? '-' : fcr(k.fcrAktual),
                k.fcrTarget === null ? '-' : fcr(k.fcrTarget),
                num(k.mortMonitoring + k.matiPanen, 0),
                rp(k.masuk), rp(k.keluar)
            ]) : [['Belum ada kolam', '', '', '', '', '', '', '', '', '']]
        });
        y = doc.lastAutoTable.finalY + 24;

        /* --- Kualitas air --- */
        const adaAir = D.perKolam.some(k => k.jumlahCatatan > 0);
        if (adaAir) {
            y = ruangCukup(doc, y, 100);
            y = judulBagian(doc, 'RATA-RATA KUALITAS AIR', y);
            doc.autoTable({
                startY: y,
                theme: 'striped',
                headStyles: { fillColor: WARNA.biru, fontSize: 7.5 },
                styles: { fontSize: 7.5, cellPadding: 4, lineColor: WARNA.garis },
                head: [['Kolam', 'Catatan', 'Suhu (°C)', 'pH', 'DO (mg/L)', 'Monitoring terakhir']],
                body: D.perKolam.map(k => [
                    k.nama, num(k.jumlahCatatan, 0),
                    k.suhu === null ? '-' : num(k.suhu, 1),
                    k.ph === null ? '-' : num(k.ph, 1),
                    k.doAir === null ? '-' : num(k.doAir, 1),
                    k.tglTerakhirMonitoring ? tglIndo(k.tglTerakhirMonitoring) : '-'
                ])
            });
            y = doc.lastAutoTable.finalY + 24;
        }

        /* --- Rekap keuangan per kategori --- */
        const katKunci = Object.keys(D.perKategori).sort();
        if (katKunci.length) {
            y = ruangCukup(doc, y, 100);
            y = judulBagian(doc, 'REKAP KEUANGAN PER KATEGORI', y);
            doc.autoTable({
                startY: y,
                theme: 'grid',
                headStyles: { fillColor: WARNA.biru, fontSize: 7.5 },
                styles: { fontSize: 7.5, cellPadding: 4, lineColor: WARNA.garis },
                head: [['Kategori', 'Jumlah transaksi', 'Nilai']],
                body: katKunci.map(k => [k, num(D.perKategori[k].transaksi, 0), rp(D.perKategori[k].jumlah)])
            });
            y = doc.lastAutoTable.finalY + 24;
        }

        /* --- Stok pakan & barang --- */
        if (D.stok.length) {
            y = ruangCukup(doc, y, 100);
            y = judulBagian(doc, 'STOK BARANG (POSISI TERKINI)', y);
            doc.autoTable({
                startY: y,
                theme: 'striped',
                headStyles: { fillColor: WARNA.biru, fontSize: 7.5 },
                styles: { fontSize: 7.5, cellPadding: 4, lineColor: WARNA.garis },
                head: [['Barang', 'Total beli (kg)', 'Terpakai (kg)', 'Sisa (kg)', 'Harga/kg']],
                body: D.stok.map(s => [s.brand, num(s.beli, 1), num(s.pakai, 1), num(s.sisa, 1), rp(s.harga)])
            });
            doc.setFontSize(7);
            doc.setTextColor(...WARNA.abu);
            doc.text('Stok adalah posisi saat laporan dicetak, bukan posisi di akhir periode.', 40, doc.lastAutoTable.finalY + 11);
            y = doc.lastAutoTable.finalY + 28;
        }

        /* --- Riwayat panen --- */
        y = ruangCukup(doc, y, 100);
        y = judulBagian(doc, 'RIWAYAT PANEN PADA PERIODE INI', y);
        doc.autoTable({
            startY: y,
            theme: 'striped',
            headStyles: { fillColor: WARNA.biru, fontSize: 7.5 },
            styles: { fontSize: 7.5, cellPadding: 4, lineColor: WARNA.garis },
            head: [['Tanggal', 'Kolam', 'Jenis & berat', 'Ekor', 'Mati']],
            body: D.panen.length ? D.panen.map(p => [
                tglIndo(p.tgl), p.kolam,
                (p.bStr || []).join(', '),
                num(angkaDariTeks(p.eStr), 0),
                num(angkaDariTeks(p.mStr), 0)
            ]) : [['-', 'Tidak ada panen pada periode ini', '', '', '']]
        });
        y = doc.lastAutoTable.finalY + 24;

        /* --- Penjualan --- */
        y = ruangCukup(doc, y, 100);
        y = judulBagian(doc, 'PENJUALAN PADA PERIODE INI', y);
        doc.autoTable({
            startY: y,
            theme: 'striped',
            headStyles: { fillColor: WARNA.biru, fontSize: 7.5 },
            styles: { fontSize: 7.5, cellPadding: 4, lineColor: WARNA.garis },
            head: [['Tanggal', 'Kolam', 'Jenis', 'Pembeli', 'Jumlah', 'Harga', 'Total', 'Bayar']],
            body: D.penjualan.length ? D.penjualan.map(j => [
                tglIndo(j.tgl), j.klm || '-', j.jn || '-', j.pb || '-',
                num(parseFloat(j.jm), 1) + ' ' + (j.st || ''),
                rp(j.hr), rp(j.tot), j.mt || '-'
            ]) : [['-', 'Tidak ada penjualan pada periode ini', '', '', '', '', '', '']]
        });
        y = doc.lastAutoTable.finalY + 24;

        /* --- Analisa --- */
        y = ruangCukup(doc, y, 120);
        y = judulBagian(doc, 'ANALISA OTOMATIS', y);
        const label = { baik: 'BAIK', perhatian: 'PERHATIAN', buruk: 'PERLU TINDAKAN', info: 'CATATAN' };
        const warnaTag = { baik: WARNA.hijau, perhatian: WARNA.oranye, buruk: WARNA.merah, info: WARNA.abu };
        doc.autoTable({
            startY: y,
            theme: 'plain',
            styles: { fontSize: 8, cellPadding: 5, lineColor: WARNA.garis, lineWidth: 0.4 },
            columnStyles: { 0: { cellWidth: 92, fontStyle: 'bold', fontSize: 7 } },
            body: analisa.map(a => [label[a.tag], a.teks]),
            didParseCell: function (data) {
                if (data.column.index === 0) data.cell.styles.textColor = warnaTag[analisa[data.row.index].tag];
            }
        });
        y = doc.lastAutoTable.finalY + 20;

        /* --- Catatan metode --- */
        y = ruangCukup(doc, y, 90);
        y = judulBagian(doc, 'CATATAN CARA PERHITUNGAN', y);
        doc.setFontSize(7.5);
        doc.setTextColor(...WARNA.abu);
        const catatan = [
            'FCR aktual = pakan terpakai (kg) dibagi hasil panen (kg) pada periode yang sama. Kolam yang belum panen tidak dihitung FCR-nya.',
            'Pakan terpakai dihitung dari catatan monitoring, bukan dari pembelian pakan. Pakan yang dibeli tapi belum diberikan tidak masuk hitungan.',
            'Nilai pakan terpakai dan pengeluaran kas sengaja dipisah agar tidak terhitung dua kali: pembelian pakan sudah tercatat sebagai pengeluaran saat dibeli.',
            'Kematian digabung dari catatan monitoring harian dan dari form panen.',
            'Seluruh angka berasal dari data yang Anda masukkan sendiri. Laporan ini tidak memperkirakan atau menambah data yang tidak dicatat.'
        ];
        let cy = y;
        catatan.forEach(t => {
            const baris = doc.splitTextToSize('\u2022 ' + t, 515);
            doc.text(baris, 40, cy);
            cy += baris.length * 10 + 2;
        });

        /* --- Nomor halaman --- */
        const total = doc.internal.getNumberOfPages();
        for (let i = 1; i <= total; i++) {
            doc.setPage(i);
            doc.setFontSize(7);
            doc.setTextColor(...WARNA.abu);
            doc.text('Terranila Book — Laporan ' + tglIndo(dari) + ' s/d ' + tglIndo(sampai), 40, 812);
            doc.text('Halaman ' + i + ' dari ' + total, 555, 812, { align: 'right' });
        }

        doc.save('Laporan_Terranila_' + dari + '_sd_' + sampai + '.pdf');
    }

    /* ---------- Antarmuka pemilih periode ---------- */
    // Modal dibuat lewat JavaScript, bukan ditambahkan ke index.html, supaya
    // berkas utama tidak perlu ikut berubah saat tampilan laporan diperbaiki.

    function pastikanModal() {
        if (document.getElementById('modal-laporan')) return;
        const el = document.createElement('div');
        el.id = 'modal-laporan';
        el.className = 'hidden fixed inset-0 z-[600] flex items-center justify-center bg-slate-900/70 p-4';
        el.innerHTML =
            '<div class="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden">' +
              '<div class="bg-blue-600 p-5 text-center text-white">' +
                '<div class="text-3xl mb-2"><i class="fas fa-file-pdf"></i></div>' +
                '<h3 class="text-lg font-bold">Unduh Laporan PDF</h3>' +
                '<p class="text-blue-100 text-xs mt-1">Rekap keuangan, performa, monitoring, panen, dan penjualan</p>' +
              '</div>' +
              '<div class="p-6 space-y-3">' +
                '<div class="grid grid-cols-2 gap-3">' +
                  '<div><label class="text-xs font-bold text-slate-500">Dari tanggal</label><input type="date" id="laporan-dari" class="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm bg-slate-50 mt-1"></div>' +
                  '<div><label class="text-xs font-bold text-slate-500">Sampai tanggal</label><input type="date" id="laporan-sampai" class="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm bg-slate-50 mt-1"></div>' +
                '</div>' +
                '<div class="flex flex-wrap gap-2 text-xs">' +
                  '<button onclick="window.setPeriodeLaporan(30)" class="px-3 py-1.5 rounded-lg border border-slate-300 hover:bg-slate-100">30 hari</button>' +
                  '<button onclick="window.setPeriodeLaporan(90)" class="px-3 py-1.5 rounded-lg border border-slate-300 hover:bg-slate-100">3 bulan</button>' +
                  '<button onclick="window.setPeriodeLaporan(365)" class="px-3 py-1.5 rounded-lg border border-slate-300 hover:bg-slate-100">1 tahun</button>' +
                  '<button onclick="window.setPeriodeLaporan(0)" class="px-3 py-1.5 rounded-lg border border-slate-300 hover:bg-slate-100">Semua data</button>' +
                '</div>' +
                '<button id="btn-buat-laporan" onclick="window.buatLaporanPDF()" class="w-full bg-blue-600 text-white font-bold py-3 rounded-xl">Buat &amp; Unduh PDF</button>' +
                '<button onclick="window.tutupModalLaporan()" class="w-full text-slate-500 text-sm py-2 hover:text-slate-700">Batal</button>' +
                '<p class="text-[11px] text-slate-400 text-center leading-snug">Pembuatan PDF butuh koneksi internet saat pertama kali, untuk mengunduh pustaka PDF.</p>' +
              '</div>' +
            '</div>';
        document.body.appendChild(el);
    }

    const isoHariIni = () => new Date().toISOString().split('T')[0];

    window.setPeriodeLaporan = function (hari) {
        const sampai = isoHariIni();
        let dari;
        if (hari === 0) {
            dari = '2000-01-01';   // cukup jauh ke belakang untuk mencakup semua data
        } else {
            const d = new Date();
            d.setDate(d.getDate() - hari);
            dari = d.toISOString().split('T')[0];
        }
        document.getElementById('laporan-dari').value = dari;
        document.getElementById('laporan-sampai').value = sampai;
    };

    window.bukaModalLaporan = function () {
        pastikanModal();
        if (!document.getElementById('laporan-dari').value) window.setPeriodeLaporan(30);
        document.getElementById('modal-laporan').classList.remove('hidden');
    };

    window.tutupModalLaporan = function () {
        const m = document.getElementById('modal-laporan');
        if (m) m.classList.add('hidden');
    };

    window.buatLaporanPDF = async function () {
        const dari = document.getElementById('laporan-dari').value;
        const sampai = document.getElementById('laporan-sampai').value;
        const pesan = (t) => (window.showCustomAlert ? window.showCustomAlert(t) : alert(t));

        if (!dari || !sampai) return pesan('Isi kedua tanggal terlebih dahulu.');
        if (dari > sampai) return pesan('Tanggal "dari" tidak boleh lebih besar daripada tanggal "sampai".');

        const btn = document.getElementById('btn-buat-laporan');
        btn.disabled = true;
        btn.innerText = 'Menyiapkan laporan...';
        try {
            await buatPdf(dari, sampai);
            window.tutupModalLaporan();
        } catch (e) {
            // Pesan aslinya ditampilkan apa adanya. Menebak penyebab di dalam
            // blok catch hanya menyesatkan saat mencari masalah.
            console.error(e);
            pesan('Gagal membuat laporan.\n(' + (e && e.message ? e.message : e) + ')');
        } finally {
            btn.disabled = false;
            btn.innerText = 'Buat & Unduh PDF';
        }
    };

    // Menggantikan fungsi lama yang hanya menampilkan pop-up "Simulasi export".
    window.downloadLaporan = window.bukaModalLaporan;
})();
