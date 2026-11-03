import { test, expect } from "@playwright/test";
test("exige sesión para el tablero", async ({ page }) => {
  await page.context().clearCookies();
  await page.goto("/");
  await expect(page).toHaveURL(/\/api\/auth\/signin/);
});
test("captura, convierte, edita y archiva un proyecto", async ({ page }) => {
  test.skip(
    !process.env.E2E_STORAGE_STATE,
    "Requiere una sesión GitHub autorizada exportada en E2E_STORAGE_STATE.",
  );
  await page.goto("/");
  const name = `Idea e2e ${Date.now()}`;
  await page.getByLabel("Nueva idea").fill(name);
  await page.getByRole("button", { name: "Guardar idea" }).click();
  const idea = page.locator(".inbox-item").filter({ hasText: name });
  await idea.getByRole("button", { name: "Convertir en proyecto" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page
    .getByLabel("Próximo paso", { exact: true })
    .fill("Validar con usuarios");
  await page.getByLabel("Etapa", { exact: true }).focus();
  await expect(
    page.getByText("Guardado", { exact: true }).first(),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Próximo paso", { exact: true })).toHaveValue(
    "Validar con usuarios",
  );
  await page
    .getByRole("button", { name: "Archivar proyecto", exact: true })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.getByRole("button", { name: "Ver archivados" }).click();
  await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
});
