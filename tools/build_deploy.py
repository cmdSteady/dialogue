#!/usr/bin/env python3
"""index.master.html (admin included)  ->  index.html (visitor-only production build).
Usage: python3 tools/build_deploy.py [master=index.master.html] [out=index.html]
"""
import sys
src = sys.argv[1] if len(sys.argv) > 1 else 'index.master.html'
dst = sys.argv[2] if len(sys.argv) > 2 else 'index.html'
s = open(src, encoding='utf-8').read()

def rep(a, b):
    global s
    assert a in s, 'pattern not found: ' + a[:70]
    s = s.replace(a, b, 1)

HEAD = open(__file__.replace('build_deploy.py', 'headblock.txt'), encoding='utf-8').read()
# 1) SEO / OG / favicon meta right after <title>
TITLE = '<title>천년의 대화 — Dialogue of a Thousand Years</title>\n'
rep(TITLE, TITLE + HEAD + '\n\n')
# 2) prologue closing space
rep('#about .ab-end{position:relative;padding-bottom:70vh}', '#about .ab-end{position:relative;padding-bottom:75vh}')
# 3) visitor-only: remove every admin entry point
rep('</style>', '#drawer,#pinWrap,#scrim,#adminBadge,#dEdit{display:none!important}\n:root{color-scheme:dark}\n</style>')
rep('<button id="adminBtn" data-cursor="ui" aria-label="관리자"><span class="dot"></span><span id="adminLbl">ADMIN</span></button>',
    '<button id="adminBtn" hidden tabindex="-1"></button><span id="adminLbl" hidden></span>')
rep('function openPin(){', 'function openPin(){ return;')
rep('function openDrawer(){', 'function openDrawer(){ return;')
rep('async function applyDroppedFiles(files){', 'async function applyDroppedFiles(files){ return;')
rep('saved = await Store.get(GALLERY_KEY);', 'saved = null;')
rep('const defaultItems = () => DEFAULT_ART.map(', 'const defaultItems = () => DEFAULT_ART.filter(a => a.uid).map(')
open(dst, 'w', encoding='utf-8').write(s)
print('wrote', dst, len(s)//1024, 'KB')
