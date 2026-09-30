import { test, expect } from '@playwright/test';

test.beforeEach(async ({ context }) => {
  await context.route(/https:\/\/fonts\.(googleapis|gstatic)\.com\//, route => route.abort());
});

test('student submits, teacher groups and grades, student sees grade and resets password', async ({ page, browser }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/register.html');
  await page.getByLabel('Full name').fill('Browser Student');
  await page.getByLabel('Email', { exact: true }).fill('111@sdu.edu.kz');
  await page.getByLabel('Password', { exact: true }).fill('test-password-123');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('heading', { name: /practical assignment/ })).toBeVisible();
  await page.getByRole('button', { name: 'New attempt' }).click();
  await page.getByLabel('Assignment / practical work title').fill('Practical One');
  await page.getByLabel('Assignment image').setInputFiles({ name: 'work.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=', 'base64') });
  await expect(page.getByAltText('Selected assignment')).toBeVisible();
  await page.getByRole('button', { name: 'Check my assignment' }).click();
  await expect(page.getByText('Saved to your assignments.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Practical One', exact: true })).toBeVisible();
  await page.screenshot({ path: 'test-results/student-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/student-mobile.png', fullPage: true });

  const teacherContext = await browser.newContext();
  await teacherContext.route(/https:\/\/fonts\.(googleapis|gstatic)\.com\//, route => route.abort());
  const teacher = await teacherContext.newPage();
  teacher.on('pageerror', error => errors.push(error.message));
  await teacher.goto('/register');
  await teacher.getByLabel('Full name').fill('Browser Teacher');
  await teacher.getByLabel('Email', { exact: true }).fill('browserteacher@sdu.edu.kz');
  await teacher.getByLabel('Password', { exact: true }).fill('test-password-123');
  await teacher.getByRole('button', { name: 'Create account' }).click();
  await teacher.getByRole('textbox', { name: 'New group name' }).fill('Group A');
  await teacher.getByRole('button', { name: 'Create group' }).click();
  await expect(teacher.getByRole('button', { name: 'Group A' })).toBeVisible();
  await teacher.getByRole('link', { name: /Browser Student/ }).click();
  await teacher.getByRole('combobox', { name: 'Student group' }).selectOption({ label: 'Group A' });
  await teacher.getByRole('button', { name: 'Save group' }).click();
  await expect(teacher.locator('.section-label', { hasText: 'Group A' })).toBeVisible();
  await teacher.getByRole('spinbutton', { name: /Grade for Practical One/ }).fill('88');
  await teacher.getByRole('button', { name: 'Save grade' }).click();
  await expect(teacher.getByText('88/100')).toBeVisible();
  await teacher.getByRole('link', { name: 'Profile', exact: true }).click();
  await expect(teacher.getByText('Your groups', { exact: true })).toBeVisible();
  await teacherContext.close();

  await page.goto('/profile.html');
  await expect(page.getByRole('cell', { name: '88/100', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Log out' }).click();
  await page.getByRole('link', { name: 'Forgot password?' }).click();
  await expect(page.getByText('Recover account', { exact: true })).toBeVisible();
  await page.getByLabel('Email', { exact: true }).fill('111@sdu.edu.kz');
  await page.getByRole('button', { name: 'Send reset link' }).click();
  await page.getByRole('link', { name: 'Open development reset link' }).click();
  await page.getByLabel('Password', { exact: true }).fill('updated-password-123');
  await page.getByLabel('Confirm password').fill('updated-password-123');
  await page.getByRole('button', { name: 'Update password' }).click();
  await expect(page.getByText('Password updated. You can now log in.')).toBeVisible();
  await page.getByRole('link', { name: 'Back to log in' }).click();
  await expect(page.getByText('Welcome back', { exact: true })).toBeVisible();
  await page.getByLabel('Email', { exact: true }).fill('111@sdu.edu.kz');
  await page.getByLabel('Password', { exact: true }).fill('updated-password-123');
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Practical One', exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test('auth mobile layout, validation, and protected routes', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/teacher-student.html?id=1');
  await expect(page).toHaveURL(/\/auth$/);
  await page.getByLabel('Email', { exact: true }).fill('bad@example.com');
  await page.getByLabel('Password', { exact: true }).fill('bad-password');
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('SDU');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/auth-mobile.png', fullPage: true });
});
