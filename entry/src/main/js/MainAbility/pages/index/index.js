// TXT Reader
import file from '@system.file';
import storage from '@system.storage';
var entries = [];
var curPath = '';
var curLabel = '';
var reading = false;
var pages = [];
var pg = 0;

var TEXT_H = 265;  // GT5 466x466 圆屏：8 行 x 12 字，正文列 336px
var FONT_PX = 28;
var CHAR_PER_LINE = 12;
var LINES_PER_PAGE = Math.floor(TEXT_H / (FONT_PX * 1.05)) - 1;
var STORAGE_KEY = 'progress';

var fileUri = '';
var fileName = '';
var chunkPos = 0;
var prevChunkStart = 0;
var CHUNK_SIZE = 3000;
var eof = false;
var turnCount = 0;
var charsPerPage = LINES_PER_PAGE * CHAR_PER_LINE;
var loadingChunk = false;

function byteLen(s) {
    var b = 0;
    for (var j = 0; j < s.length; j++) {
        var c = s.charCodeAt(j);
        if (c < 0x80) b += 1;
        else if (c < 0x800) b += 2;
        else if (c < 0x10000) b += 3;
        else b += 4;
    }
    return b;
}

function buildPages(text) {
    var p = [];
    var len = text.length;
    var clean = '';
    for (var ci = 0; ci < len; ci++) {
        var c = text.charAt(ci);
        if (c !== '\n' && c !== '\r') clean += c;
    }
    var clen = clean.length;
    var pi = 0;
    while (pi < clen) {
        var lines = [];
        for (var li = 0; li < LINES_PER_PAGE && pi + li * CHAR_PER_LINE < clen; li++) {
            var st = pi + li * CHAR_PER_LINE;
            var ed = st + CHAR_PER_LINE;
            if (ed > clen) ed = clen;
            lines.push(clean.substring(st, ed));
        }
        pi += lines.length * CHAR_PER_LINE;
        p.push(lines.join('\n'));
    }
    return p;
}

function saveProgress() {
    if (!fileName) return;
    var charPos = pg * charsPerPage;
    storage.set({ key: STORAGE_KEY + '_' + fileName, value: prevChunkStart + ':' + pg + ':' + charPos });
}

function loadChunk(self, pos, restorePg) {
    if (loadingChunk) return;
    loadingChunk = true;
    self.title = 'Loading...';
    file.readText({
        uri: fileUri,
        position: pos,
        length: CHUNK_SIZE,
        success: function (rr) {
            loadingChunk = false;
            var txt = rr.text || '';
            if (txt.length === 0 && pos > 0) { eof = true; self.showPage(); return; }
            eof = false;
            prevChunkStart = pos;
            chunkPos = pos + byteLen(txt);
            pages = buildPages(txt);
            pg = (typeof restorePg === 'number') ? Math.min(restorePg, Math.max(0, pages.length - 1)) : 0;
            self.showPage();
            saveProgress();
        },
        fail: function (e, c) {
            loadingChunk = false;
            if (pos > 0) { eof = true; self.showPage(); return; }
            self.text = 'read err: ' + c;
        }
    });
}

function restoreProgress(self) {
    storage.get({
        key: STORAGE_KEY + '_' + fileName,
        success: function (data) {
            if (data) {
                var parts = String(data).split(':');
                var savedPos = parseInt(parts[0], 10);
                var savedPg = parseInt(parts[1], 10);
                if (!isNaN(savedPos) && savedPos > 0) {
                    // Try restore — fail means file changed, clear old progress
                    file.readText({
                        uri: fileUri,
                        position: savedPos,
                        length: 1,
                        success: function () {
                            loadChunk(self, savedPos, isNaN(savedPg) ? 0 : savedPg);
                        },
                        fail: function () {
                            storage.delete({ key: STORAGE_KEY + '_' + fileName });
                            loadChunk(self, 0, 0);
                        }
                    });
                    return;
                }
            }
            loadChunk(self, 0, 0);
        },
        fail: function () { loadChunk(self, 0, 0); }
    });
}

export default {
    data: { title: '', text: '' },

    onInit: function () { this.goRoot(); },

    goRoot: function () {
        reading = false; pages = []; pg = 0; chunkPos = 0; prevChunkStart = 0; fileName = ''; eof = false; turnCount = 0; loadingChunk = false;
        this.browseDir('internal://app', '');
    },

    browseDir: function (path, label) {
        var self = this;
        curPath = path; curLabel = label || '/';
        self.title = 'Browse: ' + curLabel;
        file.list({
            uri: path,
            success: function (lr) {
                entries = lr.fileList || [];
                var lines = [];
                for (var i = 0; i < entries.length; i++) {
                    var e = entries[i];
                    var m = (e.type === 'dir') ? '/' : '';
                    lines.push('[' + e.type + '] ' + e.uri + m);
                }
                self.text = lines.length > 0 ? lines.join('\n') : '(empty)';
            },
            fail: function (e, c) { self.text = 'list err: ' + c; }
        });
    },

    showPage: function () {
        var total = pages.length;
        if (total === 0) { this.title = 'Empty'; this.text = ''; return; }
        this.title = 'Pg ' + (pg + 1) + '/' + total;
        this.text = pages[pg];
    },

    goNext: function () {
        var self = this;
        if (reading) {
            if (pg < pages.length - 1) {
                pg += 1; this.showPage();
                turnCount += 1; if (turnCount % 5 === 0) saveProgress();
            }
            else if (!eof) { loadChunk(self, chunkPos, 0); }
            return;
        }
        if (entries.length === 0) return;
        var first = entries[0];
        var newPath = curPath + '/' + first.uri;
        if (first.type === 'dir') {
            this.browseDir(newPath, curLabel + '/' + first.uri);
        } else {
            reading = true; fileUri = newPath; fileName = first.uri;
            chunkPos = 0; pg = 0; prevChunkStart = 0; pages = []; eof = false; turnCount = 0;
            restoreProgress(self);
        }
    },

    goPrev: function () {
        var self = this;
        if (reading) {
            if (pg > 0) {
                pg -= 1; this.showPage();
                turnCount += 1; if (turnCount % 5 === 0) saveProgress();
            }
            else if (prevChunkStart > 0) { loadChunk(self, Math.max(0, prevChunkStart - CHUNK_SIZE), 999); }
            return;
        }
        if (curPath === 'internal://app') return;
        var ls = curPath.lastIndexOf('/');
        var pp = curPath.substring(0, ls);
        var pl = pp.substring('internal://app'.length);
        if (pl === '') pl = '/';
        this.browseDir(pp, pl);
    },

    resetPage: function () {
        if (reading) {
            saveProgress();
            reading = false; pages = []; pg = 0; chunkPos = 0;
            this.browseDir(curPath, curLabel);
            return;
        }
        this.goRoot();
    }
};