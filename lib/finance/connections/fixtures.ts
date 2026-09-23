/** Synthetic Flex report used only by tests. No real account data. */
export const flexFixture = (positions = `<OpenPosition conid="101" symbol="TEST" description="Test &amp; Company" currency="USD" assetCategory="STK" position="2" positionValue="240" costBasisMoney="200" levelOfDetail="SUMMARY" />`) =>
  `<FlexQueryResponse><FlexStatements count="1"><FlexStatement accountId="TEST1" toDate="20260923">
    <OpenPositions>${positions}</OpenPositions>
    <CashReport><CashReportCurrency currency="BASE_SUMMARY" endingCash="500" />
      <CashReportCurrency currency="USD" endingCash="100" /><CashReportCurrency currency="EUR" endingCash="-20" /></CashReport>
  </FlexStatement></FlexStatements></FlexQueryResponse>`;
