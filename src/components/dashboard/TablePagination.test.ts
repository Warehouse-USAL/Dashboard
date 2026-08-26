import { describe, it, expect } from "vitest";
import { pageWindow } from "./TablePagination";

describe("pageWindow", () => {
  it("con exactamente 7 páginas muestra todas, sin puntos suspensivos", () => {
    expect(pageWindow(0, 7)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it("con 8 páginas ya empieza a agrupar con puntos suspensivos", () => {
    expect(pageWindow(0, 8)).toEqual([0, 1, "…", 7]);
  });

  it("parado en el medio, pone puntos suspensivos a ambos lados", () => {
    expect(pageWindow(10, 20)).toEqual([0, "…", 9, 10, 11, "…", 19]);
  });

  it("parado en la última página, agrupa el principio con puntos suspensivos", () => {
    expect(pageWindow(19, 20)).toEqual([0, "…", 18, 19]);
  });
});
