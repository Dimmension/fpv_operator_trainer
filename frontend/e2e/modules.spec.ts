import { expect, test } from "@playwright/test";

interface MemoryState {
  status: string;
  current_round: null | {
    round_number: number;
    stimulus: {
      placements: Array<{ grid_position: number; shape: string }>;
    };
  };
}

test("operator completes sequential search", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: /Начать тест/ }).first().click();
  await page.getByRole("button", { name: /Начать тест/ }).click();

  const gridLayout = await page.locator(".number-grid").evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    return {
      columns: getComputedStyle(element).gridTemplateColumns.split(" ").length,
      width: bounds.width,
      height: bounds.height,
    };
  });
  expect(gridLayout.columns).toBe(5);
  expect(Math.abs(gridLayout.width - gridLayout.height)).toBeLessThan(2);

  for (let number = 1; number <= 25; number += 1) {
    await page.getByRole("gridcell", { name: new RegExp(`^Число ${number}$`) }).click();
  }

  await expect(page.getByText("Диагностика завершена")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("25", { exact: true }).first()).toBeVisible();
});

test("leaving attention resets the active attempt", async ({ page }) => {
  await page.goto("/modules/attention");
  await page.getByRole("button", { name: /Начать тест/ }).click();
  await page.getByRole("gridcell", { name: "Число 1", exact: true }).click();
  const finishResponse = page.waitForResponse(
    (response) => response.url().endsWith("/finish") && response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Сохранить и выйти" }).click();
  await finishResponse;

  await expect(page).toHaveURL("/");
  await expect(page.getByText(/Сохранено:/)).toHaveCount(0);
  await page.getByRole("link", { name: /Начать тест/ }).first().click();
  await page.getByRole("button", { name: /Начать тест/ }).click();
  await expect(page.getByRole("gridcell", { name: "Число 1", exact: true })).toBeEnabled();
});

test("operator restores all figures in one round", async ({ page }) => {
  await page.goto("/modules/memory");
  const startResponse = page.waitForResponse(
    (response) => response.url().endsWith("/api/v1/attempts") && response.request().method() === "POST",
  );
  await page.getByRole("button", { name: /Начать тест/ }).click();
  let state = (await (await startResponse).json()) as MemoryState;

  for (let round = 1; round <= 1; round += 1) {
    await page.getByRole("button", { name: "Я готов" }).click();
    const shownGrid = page.getByLabel("Комбинация фигур");
    await expect(shownGrid).toBeVisible({ timeout: 4_000 });
    const shownPosition = await shownGrid.boundingBox();
    await expect(page.getByText(/Выберите фигуру/)).toBeVisible({ timeout: 8_000 });
    const answerPosition = await page.getByLabel("Матрица ответа").boundingBox();
    if (!shownPosition || !answerPosition) throw new Error("Expected both memory grids");
    expect(Math.abs(shownPosition.x - answerPosition.x)).toBeLessThan(1);
    expect(Math.abs(shownPosition.y - answerPosition.y)).toBeLessThan(1);
    if (!state.current_round) throw new Error("Expected an active memory round");

    for (const placement of state.current_round.stimulus.placements) {
      const labels: Record<string, string> = {
        circle: "Круг",
        triangle: "Треугольник",
        square: "Квадрат",
        cross: "Крест",
        rectangle: "Прямоугольник",
      };
      await page.getByRole("button", { name: labels[placement.shape] }).click();
      await page.getByRole("gridcell").nth(placement.grid_position).click();
    }

    const answerResponse = page.waitForResponse(
      (response) => response.url().includes("/rounds/") && response.url().endsWith("/answer"),
    );
    await page
      .getByRole("button", { name: round === 1 ? "Завершить тест" : "Готово" })
      .click();
    state = (await (await answerResponse).json()) as MemoryState;
  }

  await expect(page.getByText("Диагностика завершена")).toBeVisible();
  await expect(page.getByText("5 / 5").first()).toBeVisible();
});

test("operator marks a target in attention endurance", async ({ page }) => {
  await page.goto("/modules/endurance");
  const startResponse = page.waitForResponse(
    (response) => response.url().endsWith("/api/v1/attempts") && response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Начать тест" }).click();
  const state = await (await startResponse).json() as {
    task: { cells: string[]; target_symbol: string };
  };
  await expect(page.getByRole("gridcell")).toHaveCount(300);
  const firstTarget = state.task.cells.indexOf(state.task.target_symbol);
  await page.getByRole("gridcell").nth(firstTarget).click();
  await expect(page.getByText(`${firstTarget + 1} / 300`)).toBeVisible();
  await page.getByRole("button", { name: "Завершить и выйти" }).click();
  await expect(page).toHaveURL("/");
});

test("divided attention shows correction grid and a timed message", async ({ page }) => {
  await page.goto("/modules/divided");
  const startResponse = page.waitForResponse(
    (response) => response.url().endsWith("/api/v1/attempts") && response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Начать тест" }).click();
  const state = await (await startResponse).json() as {
    task: { visible_statement: string };
  };
  await expect(page.getByRole("gridcell")).toHaveCount(600);
  await expect(page.getByText(state.task.visible_statement)).toBeVisible();
  await page.getByRole("button", { name: "Завершить и выйти" }).click();
  await expect(page).toHaveURL("/");
});
