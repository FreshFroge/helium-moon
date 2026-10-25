"""Exercise real menu DOM/UI/CSS without initializing the 3D world."""
import os
from playwright.async_api import async_playwright
import browser_playthrough as harness

async def play(port):
    async with async_playwright() as pw:
        browser=await pw.chromium.launch(executable_path=os.environ.get('CHROMIUM_EXECUTABLE_PATH'))
        try:
            page=await browser.new_page()
            await page.route('**/client/main.js',lambda route:route.fulfill(body='',content_type='text/javascript'))
            await page.goto(f'http://localhost:{port}/')
            await page.evaluate('''async()=>{
                const {UI}=await import('/client/ui/ui.js'),{Settings}=await import('/client/core/settings.js');
                window.HM_BUILD='test-build';window.ui=new UI(new Settings());ui.game={net:null};
                document.querySelector('#loading').classList.add('hidden');ui.showMenu(true);
            }''')
            assert await page.locator('.build-id').text_content()=='Build test-build'
            for width,height in [(1440,900),(1024,768),(720,600),(390,844),(844,390)]:
                await page.set_viewport_size({'width':width,'height':height})
                for action in ['settings','controls','credits','multi']:
                    await page.click(f'#menu-main [data-act={action}]')
                    result=await page.evaluate('''()=>{
                        const panel=document.querySelector('#panel'),p=panel.getBoundingClientRect();
                        const buttons=[...document.querySelectorAll('#menu-main button')];
                        return {bounds:[p.left,p.top,p.right,p.bottom],fits:p.left>=0&&p.top>=0&&p.right<=innerWidth&&p.bottom<=innerHeight,
                            separate:buttons.every(b=>{const r=b.getBoundingClientRect();return r.right<=p.left||r.left>=p.right||r.bottom<=p.top||r.top>=p.bottom;}),
                            overflow:panel.scrollWidth>panel.clientWidth+1};
                    }''')
                    assert result['fits'] and result['separate'] and not result['overflow'],(width,height,action,result)
                    await page.locator('#panel').evaluate('(p)=>p.scrollTop=p.scrollHeight')
                await page.evaluate("ui.showMenu(false);ui.showPause(true)")
                for action in ['settings','controls']:
                    await page.click(f'#pause nav [data-act={action}]')
                    result=await page.evaluate('''()=>{
                        const p=document.querySelector('#pause-panel').getBoundingClientRect();
                        return {bounds:[p.left,p.top,p.right,p.bottom],fits:p.left>=0&&p.top>=0&&p.right<=innerWidth&&p.bottom<=innerHeight,
                            separate:[...document.querySelectorAll('#pause nav button')].every(b=>{
                                const r=b.getBoundingClientRect();return r.right<=p.left||r.left>=p.right||r.bottom<=p.top||r.top>=p.bottom;
                            })};
                    }''')
                    assert result['fits'] and result['separate'],(width,height,'pause',action,result)
                await page.evaluate("ui.showPause(false);ui.showMenu(true)")
                print(f'  ok  main/pause panels fit and leave navigation accessible at {width}x{height}',flush=True)
            await page.screenshot(path='/tmp/helium-menu-compact.png')
        finally:
            await browser.close()
if __name__=='__main__':
    harness.play=play
    harness.main()
