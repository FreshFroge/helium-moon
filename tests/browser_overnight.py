"""Repeatable keyboard objective playthroughs and trailhead screenshots.

Threats are frozen and approach positions are staged for interaction coverage.
This is browser evidence, not a claim of unassisted human survival play.
Uses the existing local-server harness; artifacts stay outside Git.
"""
import json
import os
from pathlib import Path
from playwright.async_api import async_playwright
import browser_playthrough as harness


async def play(port):
    output = Path(os.environ.get('HM_ARTIFACT_DIR', '/tmp/helium-overnight/browser'))
    output.mkdir(parents=True, exist_ok=True)
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(executable_path=os.environ.get('CHROMIUM_EXECUTABLE_PATH'), args=[
            '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
            '--autoplay-policy=no-user-gesture-required'])
        try:
            page = await browser.new_page(viewport={'width': 960, 'height': 540})
            errors = []
            page.on('pageerror', lambda err: errors.append(str(err)))
            await page.goto(f'http://localhost:{port}/?manual=1&q=low&msaa=0')
            await page.wait_for_function('window.READY || window.LOAD_ERROR', timeout=300000)
            assert not await page.evaluate('window.LOAD_ERROR')
            await page.evaluate("ui.clickToPlay=()=>{};game.startSingle('Night playtest')")
            await page.evaluate('''() => { window.approachNight = (id, station = false) => {
                const view=(station?game.objViews.stations:game.objViews.items).get(id), s=view.def;
                for(const radius of [1.25,.8,1.7,2])for(let i=0;i<16;i++){
                    const a=i*Math.PI/8,x=s.x+Math.cos(a)*radius,z=s.z+Math.sin(a)*radius;
                    if(!game.world.isPlayable(x,z))continue;
                    game.tp(x,z,s.x,s.z);game.advance(30,1/30,false);
                    const dx=s.x-game.camera.position.x,dz=s.z-game.camera.position.z;
                    game.look(Math.atan2(-dx,-dz),Math.atan2((station?s.y+.6:view.y+.15)-game.camera.position.y,Math.hypot(dx,dz)));
                    game.advance(3,1/30,false);
                    if((ui._prompt||'').toLowerCase().includes(s.name.toLowerCase()))return true;
                }
                return false;
            }; }''')
            async def advance(seconds):
                await page.evaluate('seconds=>game.advance(Math.round(seconds*30),1/30,false)', seconds)

            async def tap(key='e'):
                await page.keyboard.press(key)
                await advance(.15)

            reports = []
            for seed in [211, 212, 213]:
                await page.evaluate('''seed=>{
                    const random=Math.random;
                    try{Math.random=()=>seed/2**31;game.restart();}finally{Math.random=random;}
                    for(const a of [game.sim.hv,game.sim.sf,game.sim.director,game.sim.mimic])a.update=()=>{};
                    game.audio.play=()=>null;
                    game.advance(12,1/30,false);
                }''',seed)
                if seed == 211:
                    await page.evaluate("document.querySelector('#intro').style.display='none';game.advance(1,1/30,true)")
                    await page.screenshot(path=str(output/'spawn.png'), timeout=30000)
                    await page.evaluate('''()=>{
                        const k=game.world.structures.find(o=>o.type==='kiosk');
                        game.look(Math.atan2(-(k.x-game.player.pos.x),-(k.z-game.player.pos.z)),.15);
                        game.advance(1,1/30,true);
                    }''')
                    await page.screenshot(path=str(output/'kiosk.png'), timeout=30000)
                assert await page.evaluate("approachNight('note_memo')")
                await tap()
                assert await page.evaluate("game.reading?.id==='memo'")
                assert await page.evaluate('''()=>{
                    const h=game.info.layout.supplyHints;
                    return !h || (game.reading.text.includes(h.fuel)&&game.reading.text.includes(h.fuse));
                }'''), 'briefing must contain the actual randomized supply locations'
                assert await page.locator('#note .paper').evaluate('(e)=>e.clientHeight<=innerHeight*.85'), 'long briefing stays on screen'
                await tap()
                await page.keyboard.down('Tab')
                await advance(.15)
                if await page.evaluate('!!game.info.layout.supplyHints'):
                    assert await page.locator('#inventory svg').count()==1
                    assert await page.locator('#inventory .map-legend span').count()==len(await page.evaluate('Object.keys(game.world.poi)'))
                    assert await page.locator('#inventory .supply-register').is_visible()
                    if seed==211:
                        await page.evaluate('game.advance(1,1/30,true)')
                        await page.screenshot(path=str(output/'field-map.png'),timeout=30000)
                await page.keyboard.up('Tab')
                await advance(.1)
                report = await page.evaluate('''()=>({seed:game.sim.seed,
                    supplyHints:game.info.layout.supplyHints||null,
                    stations:game.info.layout.stations.map(s=>({id:s.id,where:s.where,hold:s.hold})),
                    supplyLocations:game.info.layout.items.filter(i=>i.kind==='fuel'||i.kind==='fuse').map(i=>({id:i.id,x:i.x,z:i.z,label:i.label||null}))})''')
                for item in ['fuel', 'fuse']:
                    assert await page.evaluate('id=>approachNight(id)', item), f'{seed}: {item} approach'
                    await tap()
                    assert await page.evaluate('id=>game.team[id]', item)
                for station in ['gen', 'relay', 'mast']:
                    assert await page.evaluate('id=>approachNight(id,true)', station), f'{seed}: {station} approach'
                    hold = await page.evaluate('id=>game.info.layout.stations.find(s=>s.id===id).hold',station)
                    if station=='gen' and seed==211 and await page.evaluate("!!game.info.layout.stations[0].steps"):
                        await page.keyboard.down('e')
                        await advance(hold*.45)
                        await page.keyboard.up('e')
                        await advance(45)
                        saved=await page.evaluate("game.sim.obj.stations.find(s=>s.id==='gen').prog")
                        assert abs(saved-1/3)<.001, f'completed first repair step survives hiding: {saved}'
                        assert 'step 2/3' in await page.evaluate('ui._prompt'), 'repair resumes at the next step'
                        report['savedRepairStep']=saved
                    await page.keyboard.down('e')
                    await advance(hold+.6)
                    await page.keyboard.up('e')
                    await advance(.15)
                    assert await page.evaluate('id=>game.objViews.stations.get(id).done',station), f'{seed}: {station} repair'
                await page.evaluate('()=>{const e=game.info.layout.extract;game.tp(e.x,e.z)}')
                await advance(8)
                assert await page.evaluate("game.result?.result==='won'")
                report['won'] = True
                reports.append(report)
                print('  ok  seeded browser objective/extraction run:',json.dumps(report),flush=True)
            assert not errors, errors
            (output/'results.json').write_text(json.dumps(reports,indent=2)+'\n')
            print('three staged browser playthroughs pass; screenshots:',output,flush=True)
        finally:
            await browser.close()


if __name__ == '__main__':
    harness.play = play
    harness.main()
