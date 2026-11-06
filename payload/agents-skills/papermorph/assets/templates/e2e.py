"""Пример проверки взаимодействия. Адаптируйте сценарии под изменяемое поведение.

    python -m http.server 8765 -d site
    URL=http://localhost:8765/BOOK/chNN/ uv run --with playwright tools/BOOK/e2e_chNN.py

Номера шагов соответствуют BEATS в файле главы.
После изменения движка запустите подходящие существующие сценарии.
В PowerShell задайте URL через $env:URL перед запуском команды uv.
"""
import asyncio, os
from playwright.async_api import async_playwright
CH = "ch01"
URL = os.environ.get("URL", f"http://localhost:8765/{CH}/index.html")


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=["--autoplay-policy=no-user-gesture-required"])
        pg = await b.new_page(viewport={"width": 1440, "height": 900})
        errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)))
        pg.on("console", lambda m: m.type == "error" and errs.append(m.text))
        await pg.goto(URL); await pg.wait_for_timeout(400)
        ev = pg.evaluate

        async def keys(*ks):
            for k in ks:
                await pg.keyboard.press(k); await pg.wait_for_timeout(60)

        async def typed(*vals):                      # fills answer boxes in order (Tab between them)
            for i, v in enumerate(vals):
                if i: await keys("Tab")
                await pg.keyboard.type(v); await pg.wait_for_timeout(40)

        async def at(i):                             # jump to beat i, playing
            await ev(f"seek({i}, true)"); await pg.wait_for_timeout(250)

        async def ok():
            assert "Верно" in await pg.inner_text(".card .fb"), await pg.inner_text(".card .fb")

        score = lambda k: ev(f"SCORE['{k}'] && SCORE['{k}'].right")   # first-try score of question id k
        await keys("Space"); await pg.wait_for_timeout(1500)
        assert await ev("P.playing && P.t > .5"), "урок воспроизводится"

        await at(2)                                  # q1: wrong first, then right
        await typed("6"); await keys("Enter"); assert await score("c-first") == 0
        await pg.locator(".box").nth(0).fill("7"); await keys("Enter"); await ok()
        await keys("Enter"); assert await ev("P.i") == 3

        await at(4)                                  # practice: one wrong, then Show answer (Esc first if a box has focus)
        await keys("2"); assert await score("p-one") == 0
        await keys("s"); assert "Ответ" in await pg.inner_text(".card .fb")
        await keys("Enter"); await pg.wait_for_timeout(200)
        assert f"глава {int(CH[2:])} завершена" in (await pg.inner_text(".card")).lower()
        await keys("r"); await pg.wait_for_timeout(200); assert await ev("P.i") == 0   # Enter on the finish card opens the next chapter

        for i in range(await ev("BEATS.length")):     # every beat must rebuild without errors
            await ev(f"seek({i}, false)")
        assert not errs, errs
        print(f"{CH}: проверка управления с клавиатуры пройдена")
        await b.close()

asyncio.run(main())
