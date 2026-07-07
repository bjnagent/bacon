import { describe, it, expect } from "vitest";
import { parseFormIdx, clusterForm4, parseForm4Txt } from "./insider";

const IDX = `Description:           Daily Index of EDGAR Dissemination Feed by Form Type
Last Data Received:    July 6, 2026
Comments:              webmaster@sec.gov

Form Type   Company Name                                                  CIK         Date Filed  File Name
---------------------------------------------------------------------------------------------------------------
10-K        BIG FILER CORP                                                999999      20260706    edgar/data/999999/0000999999-26-000001.txt
4           ACME ROBOTICS INC                                             1111111     20260706    edgar/data/1111111/0001111111-26-000010.txt
4           SMITH JANE Q                                                  2222222     20260706    edgar/data/1111111/0001111111-26-000010.txt
4           ACME ROBOTICS INC                                             1111111     20260706    edgar/data/1111111/0001111111-26-000011.txt
4           DOE JOHN                                                      3333333     20260706    edgar/data/1111111/0001111111-26-000011.txt
4           ACME ROBOTICS INC                                             1111111     20260703    edgar/data/1111111/0001111111-26-000009.txt
4           LONE INSIDER LLC                                              4444444     20260706    edgar/data/5555555/0005555555-26-000002.txt
4/A         ACME ROBOTICS INC                                             1111111     20260706    edgar/data/1111111/0001111111-26-000012.txt
`;

const FORM4_TXT = `<SEC-DOCUMENT>0001111111-26-000010.txt
<XML>
<ownershipDocument>
  <issuer>
    <issuerCik>0001111111</issuerCik>
    <issuerName>Acme Robotics Inc</issuerName>
    <issuerTradingSymbol>ACME</issuerTradingSymbol>
  </issuer>
  <nonDerivativeTable>
    <nonDerivativeTransaction><transactionCoding><transactionCode>P</transactionCode></transactionCoding></nonDerivativeTransaction>
    <nonDerivativeTransaction><transactionCoding><transactionCode>P</transactionCode></transactionCoding></nonDerivativeTransaction>
    <nonDerivativeTransaction><transactionCoding><transactionCode>S</transactionCode></transactionCoding></nonDerivativeTransaction>
    <nonDerivativeTransaction><transactionCoding><transactionCode>M</transactionCode></transactionCoding></nonDerivativeTransaction>
  </nonDerivativeTable>
</ownershipDocument>
</XML>
`;

describe("parseFormIdx", () => {
  it("parses data rows and skips headers/dividers", () => {
    const rows = parseFormIdx(IDX);
    expect(rows).toHaveLength(8);
    expect(rows[0]).toEqual({ form: "10-K", company: "BIG FILER CORP", cik: "999999", path: "edgar/data/999999/0000999999-26-000001.txt" });
  });
});

describe("clusterForm4", () => {
  it("groups distinct filings per filer, ignoring amendments and other forms", () => {
    const clusters = clusterForm4(parseFormIdx(IDX));
    // Acme appears on 3 distinct Form 4 filings (the 4/A amendment is excluded);
    // individual insiders have 1 filing each and fall under the minimum.
    expect(clusters).toHaveLength(1);
    expect(clusters[0].company).toBe("ACME ROBOTICS INC");
    expect(clusters[0].cik).toBe("1111111");
    expect(clusters[0].paths).toHaveLength(3);
  });

  it("respects the minimum filing count", () => {
    expect(clusterForm4(parseFormIdx(IDX), 1).length).toBeGreaterThan(1);
  });
});

describe("parseForm4Txt", () => {
  it("extracts issuer identity and counts buy/sell transaction codes", () => {
    const parsed = parseForm4Txt(FORM4_TXT);
    expect(parsed).not.toBeNull();
    expect(parsed!.issuerCik).toBe("0001111111");
    expect(parsed!.issuerName).toBe("Acme Robotics Inc");
    expect(parsed!.ticker).toBe("ACME");
    expect(parsed!.buys).toBe(2);  // P codes only
    expect(parsed!.sells).toBe(1); // S code; M (option exercise) ignored
  });

  it("returns null without an issuer block", () => {
    expect(parseForm4Txt("<html>not a filing</html>")).toBeNull();
  });
});
