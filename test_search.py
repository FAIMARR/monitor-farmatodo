import asyncio
from playwright.async_api import async_playwright

async def run():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()
        
        async def on_res(response):
            if "application/json" in response.headers.get("content-type", ""):
                try:
                    data = await response.json()
                    if "products" in data or "results" in data or "items" in data or "hits" in data:
                        print("JSON found in:", response.url)
                        print("Keys:", data.keys())
                        if "hits" in data:
                            print(len(data["hits"]), "hits found")
                        elif "results" in data:
                            print("results keys", data["results"][0].keys() if len(data["results"])>0 else "empty results")
                except:
                    pass
                    
        page.on("response", on_res)
        print("Goto /buscar?q=distrovit")
        await page.goto("https://www.farmatodo.com.ve/buscar?q=distrovit")
        await asyncio.sleep(8)
        print("Done")
        await browser.close()

asyncio.run(run())
