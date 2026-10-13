// TXT Reader — WATCH GT5 (466x466)
// v2.0.0：hvigor API10 / @system.* 标准导入 / GT5 圆屏布局 / IO 挂死兜底(演示模式)
import file from '@system.file';
import storage from '@system.storage';

var entries = [];
var curPath = '';
var curLabel = '';
var reading = false;
var pages = [];
var pg = 0;

var TEXT_H = 265;  // GT5 466x466 圆屏：正文列 336px，8 行 x 12 字
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

// —— IO 挂死兜底（与课程表 elcton 同款，2026-10-14 引入）——
// 已知环境：官方 Lite 模拟器对 @system.file 的 internal://app 调用静默不回调
// （不 success 不 fail）；个别固件/场景下真机 IO 也可能挂起。
// 每个异步旅程开 1s 看门狗：回调按时到达则立即撤销（真机毫秒级返回，兜底永不触发），
// 超时进入演示模式——标题带 (demo)，演示文本走同一套分页/翻页代码路径。
var DEMO_TEXT = '\u9759\u591c\u601d \u674e\u767d \u5e8a\u524d\u660e\u6708\u5149\uff0c\u7591\u662f\u5730\u4e0a\u971c\u3002\u4e3e\u5934\u671b\u660e\u6708\uff0c\u4f4e\u5934\u601d\u6545\u4e61\u3002\n\u6625\u6653 \u5b5f\u6d69\u7136 \u6625\u7720\u4e0d\u89c9\u6653\uff0c\u5904\u5904\u95fb\u557c\u9e1f\u3002\u591c\u6765\u98ce\u96e8\u58f0\uff0c\u82b1\u843d\u77e5\u591a\u5c11\u3002\n\u767b\u9e73\u96c0\u697c \u738b\u4e4b\u6da3 \u767d\u65e5\u4f9d\u5c71\u5c3d\uff0c\u9ec4\u6cb3\u5165\u6d77\u6d41\u3002\u6b32\u7a77\u5343\u91cc\u76ee\uff0c\u66f4\u4e0a\u4e00\u5c42\u697c\u3002\n\u76f8\u601d \u738b\u7ef4 \u7ea2\u8c46\u751f\u5357\u56fd\uff0c\u6625\u6765\u53d1\u51e0\u679d\u3002\u613f\u541b\u591a\u91c7\u64b7\uff0c\u6b64\u7269\u6700\u76f8\u601d\u3002';
var gen = 0;
var fbTimer = null;
var demoMode = false;

function beginJourney() {
    gen += 1;
    demoMode = false;
    if (fbTimer) { clearTimeout(fbTimer); fbTimer = null; }
    return gen;
}

function armFB(g, fire) {
    fbTimer = setTimeout(function () {
        if (g !== gen) return;
        console.info('TX FB fired');
        demoMode = true;
        fbTimer = null;
        fire();
    }, 1000);
}

function alive(g) {
    return g === gen;
}

function cancelFB() {
    if (fbTimer) { clearTimeout(fbTimer); fbTimer = null; }
}

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
    if (demoMode || !fileName) return;
    var charPos = pg * charsPerPage;
    storage.set({ key: STORAGE_KEY + '_' + fileName, value: prevChunkStart + ':' + pg + ':' + charPos });
}

// 演示模式整本装载（演示文本 < 3000B，一区块读完，eof 置位）
function loadDemo(self) {
    console.info('TX demo load');
    reading = true;
    fileName = '';
    pages = buildPages(DEMO_TEXT);
    pg = 0;
    eof = true;
    prevChunkStart = 0;
    chunkPos = 0;
    turnCount = 0;
    self.showPage();
}

function loadChunk(self, pos, restorePg, g) {
    if (typeof g !== 'number') {
        g = beginJourney();
        armFB(g, function () { loadingChunk = false; loadDemo(self); });
    }
    if (loadingChunk) return;
    loadingChunk = true;
    self.title = 'Loading...';
    file.readText({
        uri: fileUri,
        position: pos,
        length: CHUNK_SIZE,
        success: function (rr) {
            console.info('TX rc ok len=' + (rr.text ? rr.text.length : 0));
            if (!alive(g)) return;
            cancelFB();
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
            console.info('TX rc fail ' + c + (pos > 0 ? ' eof' : ' demo'));
            if (!alive(g)) return;
            cancelFB();
            loadingChunk = false;
            if (pos > 0) { eof = true; self.showPage(); return; }
            demoMode = true;
            loadDemo(self);
        }
    });
}

function restoreProgress(self, g) {
    storage.get({
        key: STORAGE_KEY + '_' + fileName,
        success: function (data) {
            console.info('TX sget ' + (data ? 'data' : 'empty'));
            if (!alive(g)) return;
            cancelFB();
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
                            if (!alive(g)) return;
                            loadChunk(self, savedPos, isNaN(savedPg) ? 0 : savedPg, g);
                        },
                        fail: function () {
                            if (!alive(g)) return;
                            storage.delete({ key: STORAGE_KEY + '_' + fileName });
                            loadChunk(self, 0, 0, g);
                        }
                    });
                    return;
                }
            }
            loadChunk(self, 0, 0, g);
        },
        fail: function () { console.info('TX sget fail'); if (!alive(g)) return; loadChunk(self, 0, 0, g); }
    });
}

export default {
    data: { title: '', text: '' },

    onInit: function () { this.goRoot(); },

    goRoot: function () {
        beginJourney();
        reading = false; pages = []; pg = 0; chunkPos = 0; prevChunkStart = 0; fileName = ''; eof = false; turnCount = 0; loadingChunk = false;
        this.browseDir('internal://app', '');
    },

    browseDir: function (path, label) {
        var self = this;
        var g = beginJourney();
        curPath = path; curLabel = label || '/';
        self.title = 'Browse: ' + curLabel;
        armFB(g, function () {
            console.info('TX FB browse fire');
            entries = [{ type: 'file', uri: 'demo.txt' }];
            self.title = 'Browse: ' + curLabel + ' (demo)';
            self.text = '[file] demo.txt';
        });
        file.list({
            uri: path,
            success: function (lr) {
                console.info('TX list ok n=' + (lr.fileList ? lr.fileList.length : -1) + ' first=' + (lr.fileList && lr.fileList.length ? lr.fileList[0].type + ':' + lr.fileList[0].uri : '-'));
                if (!alive(g)) return;
                cancelFB();
                entries = lr.fileList || [];
                var lines = [];
                for (var i = 0; i < entries.length; i++) {
                    var e = entries[i];
                    var m = (e.type === 'dir') ? '/' : '';
                    lines.push('[' + e.type + '] ' + e.uri + m);
                }
                self.text = lines.length > 0 ? lines.join('\n') : '(empty)';
            },
            fail: function (e, c) {
                console.info('TX list fail ' + c + ' -> demo');
                if (!alive(g)) return;
                cancelFB();
                demoMode = true;
                entries = [{ type: 'file', uri: 'demo.txt' }];
                self.title = 'Browse: ' + curLabel + ' (demo)';
                self.text = '[file] demo.txt';
            }
        });
    },

    showPage: function () {
        var total = pages.length;
        if (total === 0) { this.title = 'Empty'; this.text = ''; return; }
        this.title = 'Pg ' + (pg + 1) + '/' + total + (demoMode ? ' (demo)' : '');
        this.text = pages[pg];
    },

    goNext: function () {
        var self = this;
        if (reading) {
            if (pg < pages.length - 1) {
                pg += 1; this.showPage();
                turnCount += 1; if (turnCount % 5 === 0) saveProgress();
            }
            else if (!eof) {
                var g = beginJourney();
                armFB(g, function () { loadingChunk = false; self.title = 'timeout 点击重试'; });
                loadChunk(self, chunkPos, 0, g);
            }
            return;
        }
        console.info('TX next n=' + entries.length);
        if (entries.length === 0) return;
        var first = entries[0];
        var newPath = curPath + '/' + first.uri;
        if (first.type === 'dir') {
            this.browseDir(newPath, curLabel + '/' + first.uri);
        } else {
            var g2 = beginJourney();
            reading = true; fileUri = newPath; fileName = first.uri;
            chunkPos = 0; pg = 0; prevChunkStart = 0; pages = []; eof = false; turnCount = 0;
            armFB(g2, function () { loadDemo(self); });
            restoreProgress(self, g2);
        }
    },

    goPrev: function () {
        var self = this;
        if (reading) {
            if (pg > 0) {
                pg -= 1; this.showPage();
                turnCount += 1; if (turnCount % 5 === 0) saveProgress();
            }
            else if (prevChunkStart > 0) {
                var g = beginJourney();
                armFB(g, function () { loadingChunk = false; self.title = 'timeout 点击重试'; });
                loadChunk(self, Math.max(0, prevChunkStart - CHUNK_SIZE), 999, g);
            }
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
            this.goRoot();
            return;
        }
        this.goRoot();
    }
};
