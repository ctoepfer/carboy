/*
 * Scripted checks for the UI prototype: keyboard flows, validation, save
 * states, focus, reflow at 320 px, console errors, and axe-core (Chromium
 * only). Throwaway, like the prototype.
 *
 * Installs nothing. Point PLAYWRIGHT_MODULE at an existing Playwright package
 * whose browsers are installed, then:
 *   PLAYWRIGHT_MODULE=/path/to/node_modules/playwright node tools/check.js chromium,firefox
 * Screenshots go to $CHECK_OUT (default: a new temporary directory).
 * Results on 2026-11-07 are in docs/product/UI_DESIGN.md §6.
 */
if (!process.env.PLAYWRIGHT_MODULE) { console.error('Set PLAYWRIGHT_MODULE to an installed playwright package.'); process.exit(2); }
const pw = require(process.env.PLAYWRIGHT_MODULE);
const path = require('path');
const fs = require('fs');
const os = require('os');
const ROOT = path.resolve(__dirname, '..', 'index.html').replace(/\\/g, '/').replace(/^([A-Za-z]:)/, '/$1');
const AXE = path.resolve(__dirname, '..', '..', 'phase1', 'shell-tauri', 'ui', 'shared', 'axe.min.js');
const OUT = process.env.CHECK_OUT || fs.mkdtempSync(path.join(os.tmpdir(), 'ui-prototype-'));
console.log(`screenshots: ${OUT}`);
const engines = (process.argv[2] || 'chromium').split(',');
let failures = 0;
function check(name, cond, extra = '') { if (!cond) failures++; console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`); }

(async () => {
  for (const eng of engines) {
    console.log(`\n=== ${eng}`);
    const browser = await pw[eng].launch();
    const page = await browser.newPage({ viewport: { width: 1360, height: 900 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.text()); });
    const mod = 'Control';
    const realClick = page.click.bind(page);
    page.click = async (sel, o) => { await realClick(sel, o); await page.waitForTimeout(80); };
    const status = async () => (await page.textContent('#status')).trim();
    const waitStatus = async (re) => { await page.waitForFunction((s) => new RegExp(s).test(document.getElementById('status').textContent), re.source, { timeout: 3000 }).catch(() => {}); return status(); };
    const focusedKey = () => page.evaluate(() => document.activeElement && (document.activeElement.dataset.key || document.activeElement.tagName));
    const axe = async (label) => {
      await page.addScriptTag({ path: AXE });
      const r = await page.evaluate(async () => { const res = await axe.run(document, { preload: false, runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] }); return res.violations.map((v) => `${v.id} (${v.nodes.length}): ${v.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(' | ')}`); });
      check(`axe ${label}`, r.length === 0, r.join('; '));
    };

    await page.goto('file://' + ROOT);
    await page.waitForSelector('table.data');
    check('library loads, h1 focused', (await page.evaluate(() => document.activeElement.tagName)) === 'H1');
    check('library title', (await page.title()) === 'Recipe library');
    const rows = await page.$$eval('table.data tbody tr', (r) => r.length);
    check('library lists 9 recipes', rows === 9, String(rows));
    if (eng === 'chromium') await axe('library light');

    await page.fill('[data-key=query]', 'stout');
    check('search filters', (await page.$$eval('table.data tbody tr', (r) => r.length)) === 1);
    check('focus stays in search', (await focusedKey()) === 'query');
    await page.fill('[data-key=query]', 'zzz');
    check('empty search state', await page.isVisible('[data-key=clear-search]'));
    await page.click('[data-key=clear-search]');
    check('clear search restores', (await page.$$eval('table.data tbody tr', (r) => r.length)) === 9);

    // Open APA all grain by keyboard.
    await page.focus('[data-key="open-apa-ag"]');
    await page.keyboard.press('Enter');
    await page.waitForSelector('.doc-head');
    check('editor h1 focused', (await page.evaluate(() => document.activeElement.tagName)) === 'H1');
    check('saved state shown', /Saved as revision 1/.test(await page.textContent('.save-state')));
    const statTexts = await page.$$eval('.stat', (s) => s.map((x) => x.querySelector('.stat-calc').textContent.trim()));
    check('IBU unavailable, not zero', /no accepted formula/.test(statTexts[4]) && !/\b0\b/.test(statTexts[4]));
    check('OG labelled not connected', /not connected/.test(statTexts[0]));
    if (eng === 'chromium') await axe('editor light');

    // Edit an amount by keyboard: Cascade 15 min (second Cascade row).
    const amts = await page.$$eval('[data-commit=amount]:not([data-key^="amt-i-"])', (els) => els.map((e) => e.dataset.key));
    const casc15 = amts[3];
    await page.fill(`[data-key="${casc15}"]`, '21');
    await page.press(`[data-key="${casc15}"]`, 'Enter');
    let s = await waitStatus(/to 21 g/);
    check('amount change announced', /28\.3 g to 21 g/.test(s), s);
    check('focus stays on edited field', (await focusedKey()) === casc15);
    check('unsaved state', /1 unsaved change/.test(await page.textContent('.save-state')));
    check('nav shows change count', /1 change/.test(await page.textContent('#rail-links')));

    // Invalid input.
    for (const [input, re] of [['abc', /isn't an amount/], ['1,5', /comma is ambiguous/], ['2 L', /measured by mass/], ['0', /more than zero/], ['5 furlongs', /isn't a recognised unit/]]) {
      await page.fill(`[data-key="${casc15}"]`, input);
      await page.press(`[data-key="${casc15}"]`, 'Enter');
      const err = await page.evaluate((k) => { const el = document.querySelector(`[data-key="${k}"]`); const id = (el.getAttribute('aria-describedby') || '').split(' ')[0]; return { inv: el.getAttribute('aria-invalid'), msg: id && document.getElementById(id) ? document.getElementById(id).textContent : '' , focused: document.activeElement === el }; }, casc15);
      check(`invalid "${input}" refused with message`, err.inv === 'true' && re.test(err.msg) && err.focused, err.msg);
    }
    await page.press(`[data-key="${casc15}"]`, 'Escape');
    check('Escape restores value', (await page.inputValue(`[data-key="${casc15}"]`)) === '21 g');
    check('still 1 change after invalid attempts', /1 unsaved change/.test(await page.textContent('.save-state')));
    await page.fill(`[data-key="${casc15}"]`, '1 oz');
    await page.press(`[data-key="${casc15}"]`, 'Enter');
    check('unit typed with value accepted', (await page.inputValue(`[data-key="${casc15}"]`)) === '1 oz');

    // Undo / redo by keyboard, focus outside a changed text field.
    await page.focus('[data-key=undo]');
    await page.keyboard.press(`${mod}+z`);
    s = await waitStatus(/Undid/);
    check('Ctrl+Z undoes', /Undid/.test(s) && (await page.inputValue(`[data-key="${casc15}"]`)) === '21 g', s);
    await page.keyboard.press(`${mod}+Shift+z`);
    s = await waitStatus(/Redid/);
    check('Ctrl+Shift+Z redoes', (await page.inputValue(`[data-key="${casc15}"]`)) === '1 oz', s);

    // Move an addition to another stage with the select (non-drag).
    const stgKey = amts[6].replace('amt-', 'stg-');
    await page.focus(`[data-key="${stgKey}"]`);
    await page.selectOption(`[data-key="${stgKey}"]`, { label: 'Boil' });
    s = await waitStatus(/moved from/);
    check('move addition announced', /moved from Fermentation to Boil/.test(s), s);
    check('focus stays on stage select', (await focusedKey()) === stgKey);

    // Move a stage with buttons.
    const firstStageId = await page.$eval('.stage-item [data-type=stage]', (b) => b.dataset.id);
    await page.click(`[data-key="down-${firstStageId}"]`);
    s = await waitStatus(/position 2/);
    check('stage moved announced', /position 2 of 4/.test(s), s);
    // Graph stand-in sync: select a node, list follows.
    await page.click('.graph .node >> nth=2');
    await page.waitForTimeout(100);
    const sync = await page.evaluate(() => { const n = document.querySelector('.node.is-selected'); const l = document.querySelector('.stage-item.is-selected [data-type=stage]'); return n && l && n.dataset.id === l.dataset.id; });
    check('graph selection syncs list', sync);
    check('inspector shows stage', /Position/.test(await page.textContent('.inspector')));
    await page.focus('.graph .node[tabindex="0"]');
    await page.keyboard.press('ArrowRight');
    check('graph arrow keys move focus', await page.evaluate(() => document.activeElement.classList.contains('node')));

    // Mouse: type then click Save directly (render hold).
    await page.fill(`[data-key="${amts[0]}"]`, '4800');
    await page.click('[data-key=save]');
    s = await waitStatus(/Saved/);
    check('type then click Save saves both (no lost click)', /as revision 2/.test(s) && (await page.inputValue(`[data-key="${amts[0]}"]`)) === '4800 g' && /Saved as revision 2/.test(await page.textContent('.save-state')), s);

    // Review: make a change, open review, failure, retry.
    await page.fill(`[data-key="${amts[1]}"]`, '200');
    await page.press(`[data-key="${amts[1]}"]`, 'Enter');
    await page.click('[data-key=review]');
    await page.waitForSelector('.diff');
    check('review h1 focused', (await page.evaluate(() => document.activeElement.textContent)) === 'Review changes');
    const diffText = await page.textContent('.diff');
    check('diff shows before and after', /227 g/.test(diffText) && /200 g/.test(diffText), diffText.replace(/\s+/g, ' ').trim());
    if (eng === 'chromium') await axe('review light');
    await page.click('.proto-controls summary');
    await page.check('#sim-failure');
    await page.click('[data-key=review-save]');
    await page.waitForSelector('[role=alert]');
    check('save failure shown, focus on error', (await focusedKey()) === 'save-error');
    check('draft kept after failure', /1 change/.test(await page.textContent('#rail-links')));
    await page.evaluate(() => { const c = document.getElementById('sim-failure'); c.checked = false; c.dispatchEvent(new Event('change', { bubbles: true })); });
    await page.click('[data-key=save-retry]');
    s = await waitStatus(/revision 3/);
    check('retry saves', /revision 3/.test(s), s);

    // Discard with undo.
    await page.fill(`[data-key="${amts[1]}"]`, '150');
    await page.press(`[data-key="${amts[1]}"]`, 'Enter');
    await page.goto(page.url().replace(/#.*/, '') + '#/recipe/apa-ag/review');
    await page.waitForSelector('[data-key=discard]');
    await page.click('[data-key=discard]');
    check('discard offers undo, focused', (await focusedKey()) === 'undo-discard');
    await page.keyboard.press('Enter');
    check('undo discard restores', /1 change/.test(await page.textContent('#rail-links')));

    // Proposal on the Dubbel.
    await page.goto('file://' + ROOT + '#/recipe/dubbel-ag/review');
    await page.waitForSelector('.proposal');
    check('proposal shown with rationale', /Special B/.test(await page.textContent('.proposal')));
    await page.click('[data-key=accept]');
    s = await waitStatus(/accepted/);
    check('proposal accepted as revision 2', /revision 2/.test(s), s);

    // Missing data: Schwarzbier and long recipe.
    await page.goto('file://' + ROOT + '#/recipe/schwarz');
    await page.waitForSelector('.advisories');
    const adv = await page.textContent('.advisories');
    check('Schwarzbier: no culture flagged', /No yeast/.test(adv));
    check('Schwarzbier: mash has no rest', /no rest temperature/.test(adv));
    await page.goto('file://' + ROOT + '#/recipe/long');
    await page.waitForSelector('.advisories');
    const longRows = await page.$$eval('table.editable tbody tr', (r) => r.length);
    check('long recipe renders all additions', longRows === 37, String(longRows));
    const mcu = await page.$$eval('.stat', (s) => s[1].textContent);
    check('MCU names missing inputs', /Missing: Smoked malt/.test(mcu), mcu.replace(/\s+/g, ' '));
    if (eng === 'chromium') await axe('long recipe');
    await page.click('.advisories button >> nth=0');
    check('advisory Show focuses property field', /^prop-/.test(await focusedKey() || ''), await focusedKey());
    await page.fill('[data-key^="prop-"]:focus', '5');
    await page.keyboard.press('Enter');
    s = await waitStatus(/set to/);
    check('property entered', /set to 5/.test(s), s);
    await page.screenshot({ path: `${OUT}/${eng}-long.png`, fullPage: false });

    // New recipe: empty state, add stage, add ingredient with validation.
    await page.goto('file://' + ROOT + '#/library');
    await page.waitForSelector('[data-key=new-recipe]');
    await page.click('[data-key=new-recipe]');
    await page.waitForSelector('.doc-head');
    check('new recipe: not saved yet', /Not saved yet/.test(await page.textContent('.save-state')));
    await page.click('[data-key=add-ingredient]');
    s = await waitStatus(/stage first/);
    check('add ingredient without stage explains', /Add a stage first/.test(s), s);
    await page.click('[data-key=add-stage]');
    await page.selectOption('#as-kind', 'mash');
    await page.click('#dlg-add button[type=submit]');
    await page.click('[data-key=add-ingredient]');
    await page.waitForSelector('#ai-name');
    await page.fill('#ai-amount', '25');
    await page.click('#dlg-add button[type=submit]');
    const summaryFocused = await page.evaluate(() => document.activeElement.classList.contains('error-summary'));
    const summary = await page.textContent('.error-summary');
    check('dialog errors summarised and focused', summaryFocused && /2 problems/.test(summary), summary);
    await page.fill('#ai-name', 'Local pale malt');
    await page.fill('#ai-amount', '4 kg');
    await page.click('#dlg-add button[type=submit]');
    s = await waitStatus(/Added Local/);
    check('custom ingredient added', /Added Local pale malt/.test(s), s);
    check('its unknown properties flagged', /Colour unknown/.test(await page.textContent('table.editable')));
    if (eng === 'chromium') await axe('new recipe');

    // Palette.
    await page.keyboard.press(`${mod}+k`);
    await page.waitForSelector('#pal-q');
    await page.keyboard.type('review');
    await page.keyboard.press('Enter');
    await page.waitForSelector('.view-head h1');
    check('palette runs Review changes', /review/.test(page.url()));

    // Themes: screenshots and axe in dark and contrast.
    for (const theme of ['light', 'dark', 'contrast']) {
      await page.goto('file://' + ROOT + '#/recipe/hefe-ag');
      await page.evaluate((t) => { document.documentElement.dataset.theme = t; }, theme);
      await page.waitForSelector('.doc-head');
      await page.focus('[data-commit=amount]');
      await page.screenshot({ path: `${OUT}/${eng}-editor-${theme}.png` });
      if (eng === 'chromium' && theme !== 'light') await axe(`editor ${theme}`);
    }
    await page.setViewportSize({ width: 320, height: 800 });
    await page.screenshot({ path: `${OUT}/${eng}-320.png`, fullPage: false });
    const hscroll = await page.evaluate(() => { const w = document.documentElement.clientWidth; const wide = [...document.querySelectorAll('body *')].filter((e) => { const r = e.getBoundingClientRect(); return r.right > w + 1 && !e.closest('.table-wrap'); }).slice(0, 5).map((e) => e.className || e.tagName); return { over: document.documentElement.scrollWidth > w, wide }; });
    check('320px: no page-level horizontal scroll', !hscroll.over, hscroll.wide.join(', '));
    check('no console errors or missing messages', errors.length === 0, errors.join(' | '));
    await browser.close();
  }
  console.log(`\nfailures: ${failures}`);
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
