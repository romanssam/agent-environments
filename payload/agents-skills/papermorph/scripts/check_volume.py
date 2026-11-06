#!/usr/bin/env python3
"""Проверка громкости главы с настоящим звуком.

Запустите локальный сервер, затем передайте --url с адресом готовой главы.
Необязательный --audio с путём MP3 дополнительно проверит шаблон главы.
Пример: uv run --with playwright scripts/check_volume.py --url http://127.0.0.1:8767/ch01/ --audio C:/Books/intro.mp3
Скрипт не создаёт файлов. Требуется Chromium для Playwright.
"""
import argparse
import asyncio
import json
from pathlib import Path
from urllib.parse import urlparse, urlsplit, urlunsplit

from playwright.async_api import async_playwright

SKILL = Path(__file__).resolve().parents[1]
AUDIO = None


async def template(route):
    name = urlparse(route.request.url).path.split("/__volume_template__/")[1]
    if name == "ch01/":
        await route.fulfill(path=SKILL / "assets/templates/chapter.html")
    elif name.startswith("lib/"):
        await route.fulfill(path=SKILL / "assets/engine" / Path(name).name)
    elif name.endswith("timings.js"):
        timing = {"dur": 30, "marks": {"sub": 1, "note": 2, "w1": 3, "w2": 4}, "cues": []}
        await route.fulfill(content_type="text/javascript", body="const TIMINGS = " + json.dumps(
            {key: timing for key in ("intro", "idea", "q1", "wrap", "final1", "finish")}))
    else:
        # Template has no narrated assets; exercise it with an existing, real MP3.
        await route.fulfill(path=AUDIO)


async def check(browser, url, is_template=False):
    page = await browser.new_page(viewport={"width": 1440, "height": 900}, has_touch=True)
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.on("console", lambda message: message.type == "error" and errors.append(message.text))
    page.on("response", lambda response: response.status >= 400 and errors.append(response.url))
    page.on("requestfailed", lambda request: request.failure != "net::ERR_ABORTED" and errors.append(request.url))
    if is_template:
        await page.route("**/__volume_template__/**", template)
    await page.goto(url)
    await page.wait_for_function("typeof P !== 'undefined' && P.audio && P.audio.readyState >= 2")
    slider = page.get_by_role("slider", name="Громкость", exact=True)
    button = page.get_by_role("button", name="Изменить громкость", exact=True)
    assert await slider.count() == 1
    assert await page.evaluate("P.audio.volume") == 1
    assert await page.evaluate("""Math.abs(document.querySelector('.volume').getBoundingClientRect().width -
      document.querySelector('#bHelp').getBoundingClientRect().width) < .1"""), "закрытый регулятор громкости совпадает по размеру с остальными круглыми кнопками"
    assert await slider.evaluate("e => e.getBoundingClientRect().width === 0")
    await button.hover()
    await page.wait_for_function("document.querySelector('#volume').getBoundingClientRect().width > 80")
    await page.mouse.move(0, 0)
    await page.wait_for_function("document.querySelector('#volume').getBoundingClientRect().width === 0")
    await button.focus()
    await button.press("Tab")
    assert await slider.evaluate("e => e === document.activeElement && e.getBoundingClientRect().width > 80")

    async def volume(value):
        await button.hover()
        await slider.fill(value)

    await volume("0.4")
    assert await page.evaluate("P.audio.volume") == .4
    await page.locator("#cover").click()
    await page.wait_for_function("P.audio.currentTime > .2 && P.t > .1")

    for value in ("0", "0.5", "1"):
        await volume(value)
        assert await page.evaluate("P.audio.volume") == float(value)
        before = await page.evaluate("P.audio.currentTime")
        await page.wait_for_function("P.audio.currentTime > " + str(before + .1))
        await page.locator("#bPlay").click()
        paused = await page.evaluate("P.audio.currentTime")
        await page.wait_for_timeout(200)
        assert await page.evaluate("P.audio.paused && !P.playing")
        assert abs(await page.evaluate("P.audio.currentTime") - paused) < .05
        await volume(f"{1 - float(value):g}")
        assert await page.evaluate("P.audio.volume") == 1 - float(value)
        assert await page.evaluate("P.audio.paused && !P.playing")
        await volume(value)
        await page.locator("#bPlay").click()
        await page.wait_for_function("P.audio.currentTime > " + str(paused + .1))
        await page.locator("#segs button").nth(1).click()
        await page.wait_for_function("P.i === 1 && P.audio.currentTime > .1")
        assert await page.evaluate("P.audio.volume") == float(value)
        # Also cover automatic completion, not just manual seeking.
        await page.evaluate("P.audio.currentTime = P.audio.duration; P.t = P.end")
        await page.wait_for_function("P.i === 2")
        assert await page.evaluate("P.audio.volume") == float(value)
        await page.locator("#bRestart").click()
        await page.wait_for_function("P.i === 0 && P.audio.currentTime > .1")
        assert await page.evaluate("P.audio.volume") == float(value)

    await page.evaluate("window.volumeAudio = P.audio")
    await slider.focus()
    for key, value in (("Home", 0), ("ArrowRight", .05), ("ArrowUp", .1),
                       ("ArrowLeft", .05), ("End", 1), ("ArrowDown", .95)):
        await slider.press(key)
        assert abs(await page.evaluate("P.audio.volume") - value) < .001
        assert await page.evaluate("P.i === 0 && P.playing && P.audio === window.volumeAudio"), "клавиши регулятора не должны менять шаг, перезапускать урок или ставить его на паузу"
    await page.evaluate("seek(BEATS.findIndex(b => b.ask), false)")
    await slider.focus()
    await slider.press("Home")
    await slider.press("Enter")
    assert await page.evaluate("P.i > 0 && P.audio.volume === 0 && Object.keys(SCORE).length === 0"), "Enter в регуляторе не должен отправлять ответ"
    await page.locator("#bRestart").click()

    for width, height in ((390, 844), (320, 568), (700, 390), (1440, 900)):
        await page.set_viewport_size({"width": width, "height": height})
        await button.hover()
        await page.wait_for_timeout(250)
        assert await page.evaluate("""[...document.querySelectorAll('#bar > *, #volume')].every(e => {
          if (getComputedStyle(e).display === 'none') return true;
          const r = e.getBoundingClientRect();
          return r.x >= 0 && r.y >= 0 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1;
        })"""), f"кнопки обрезаны при размере окна {width}x{height}"
        if width <= 700:
            bounds = await slider.bounding_box()
            assert bounds["width"] >= 99 and bounds["height"] >= 38
            await slider.click(position={"x": bounds["width"] / 2, "y": bounds["height"] / 2})
            assert .3 < await page.evaluate("P.audio.volume") < .7
    await page.set_viewport_size({"width": 390, "height": 844})
    await page.mouse.move(0, 0)
    await slider.evaluate("e => e.blur()")
    await button.tap()
    assert await slider.evaluate("e => e === document.activeElement && e.getBoundingClientRect().width > 80"), "касание открывает регулятор"
    await slider.press("Escape")
    await page.mouse.move(0, 0)
    await page.wait_for_function("document.querySelector('#volume').getBoundingClientRect().width === 0")
    assert not errors, errors
    print(f"ПРОЙДЕНО {url}: наведение, фокус, касание, звук, громкость, пауза, шаги, перезапуск, клавиатура, узкий экран")
    await page.close()


async def main(url, audio=None):
    global AUDIO
    AUDIO = audio
    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(args=["--autoplay-policy=no-user-gesture-required"])
        await check(browser, url)
        if AUDIO:
            parsed = urlsplit(url)
            template_url = urlunsplit((parsed.scheme, parsed.netloc, "/__volume_template__/ch01/", "", ""))
            await check(browser, template_url, is_template=True)
        await browser.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Проверка громкости русской главы Papermorph с настоящим звуком.")
    parser.add_argument("--url", required=True, help="HTTP-адрес готовой главы, например http://127.0.0.1:8767/ch01/")
    parser.add_argument("--audio", type=Path, help="Существующий MP3 для дополнительной проверки шаблона")
    args = parser.parse_args()
    if urlsplit(args.url).scheme not in ("http", "https"):
        parser.error("--url должен быть HTTP- или HTTPS-адресом")
    if args.audio and not args.audio.is_file():
        parser.error("--audio должен указывать на существующий MP3-файл")
    asyncio.run(main(args.url, args.audio))
