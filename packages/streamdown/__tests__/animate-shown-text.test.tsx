import { act, render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Streamdown } from "../index";

const durations = (container: HTMLElement) =>
  Array.from(container.querySelectorAll<HTMLElement>("[data-sd-animate]")).map(
    (span) =>
      `${span.textContent?.trim()}=${span.style.getPropertyValue("--sd-duration")}`
  );

const stream = (text: string, isAnimating = true) => (
  <Streamdown animated isAnimating={isAnimating}>
    {text}
  </Streamdown>
);

describe("animated text already on screen", () => {
  it("fades in when the text is replaced while streaming", async () => {
    const { container, rerender } = render(
      stream("Alpha beta gamma delta epsilon zeta")
    );
    await act(() => Promise.resolve());

    rerender(stream("Omega psi chi"));
    await act(() => Promise.resolve());

    expect(durations(container)).toEqual([
      "Omega=150ms",
      "psi=150ms",
      "chi=150ms",
    ]);
  });

  it("fades in when a finished message is streamed again", async () => {
    const { container, rerender } = render(
      stream("Alpha beta gamma delta epsilon zeta")
    );
    await act(() => Promise.resolve());
    rerender(stream("Alpha beta gamma delta epsilon zeta", false));
    await act(() => Promise.resolve());

    rerender(stream(""));
    await act(() => Promise.resolve());
    rerender(stream("Omega psi chi"));
    await act(() => Promise.resolve());

    expect(durations(container)).toEqual([
      "Omega=150ms",
      "psi=150ms",
      "chi=150ms",
    ]);
  });

  it("fades a word where shown markdown syntax turns into bold", async () => {
    const { container, rerender } = render(stream("Alpha bravo **"));
    await act(() => Promise.resolve());

    rerender(stream("Alpha bravo **charlie"));
    await act(() => Promise.resolve());

    expect(durations(container)).toEqual([
      "Alpha=0ms",
      "bravo=0ms",
      "charlie=150ms",
    ]);
  });

  it("keeps a table header settled when the first body row starts", async () => {
    const { container, rerender } = render(
      stream("| Name | Value |\n| --- | --- |\n")
    );
    await act(() => Promise.resolve());

    rerender(stream("| Name | Value |\n| --- | --- |\n|"));
    await act(() => Promise.resolve());

    expect(durations(container)).toEqual(["Name=0ms", "Value=0ms"]);
  });

  it("keeps link text shown while its brackets come and go", async () => {
    const { container, rerender } = render(stream("Read [the migration"));
    await act(() => Promise.resolve());

    // `[text]` with no `(` yet renders as literal text, then as a link again.
    rerender(stream("Read [the migration guide]"));
    await act(() => Promise.resolve());
    const literal = durations(container);
    rerender(stream("Read [the migration guide]("));
    await act(() => Promise.resolve());

    expect(literal).toEqual([
      "Read=0ms",
      "[the=0ms",
      "migration=0ms",
      "guide]=150ms",
    ]);
    expect(durations(container)).toEqual([
      "Read=0ms",
      "the=0ms",
      "migration=0ms",
      "guide=0ms",
    ]);
  });

  it("fades only the new words when the text is extended", async () => {
    const { container, rerender } = render(stream("Alpha beta gamma"));
    await act(() => Promise.resolve());

    rerender(stream("Alpha beta gamma delta"));
    await act(() => Promise.resolve());

    expect(durations(container)).toEqual([
      "Alpha=0ms",
      "beta=0ms",
      "gamma=0ms",
      "delta=150ms",
    ]);
  });
});
