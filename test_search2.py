import asyncio
from playwright.async_api import async_playwright

async def run():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()
        
        async def on_res(response):
            if "application/json" in response.headers.get("content-type", "") or "application/x-algolia" in response.headers.get("content-type", "") or "text/plain" in response.headers.get("content-type", ""):
                try:
                    data = await response.json()
                    # It could be {"results": [{"hits": [...]}]}
                    if isinstance(data, dict) and "results" in data and len(data["results"]) > 0:
                        if "hits" in data["results"][0]:
                            print("FOUND ALGOLIA HITS", len(data["results"][0]["hits"]))
                except Exception as e:
                    pass
                    
        page.on("response", on_res)
        print("Goto /buscar?q=distrovit")
        await page.goto("https://www.farmatodo.com.ve/buscar?q=distrovit")
        await asyncio.sleep(8)
        
        # Take screenshot and get HTML
        await page.screenshot(path="test_search.png")
        html = await page.content()
        with open("test_html.html", "w", encoding="utf-8") as f:
            f.write(html)
            
        print("Done")
        await browser.close()

asyncio.run(run())
