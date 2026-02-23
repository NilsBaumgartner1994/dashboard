import { DateHelper } from 'repo-depkit-common';

describe('date helper test', () => {
  it('reverse date correct', () => {
    let day = 2;
    let month = 3;
    let year = 2024;
    let date = new Date(year, month - 1, day);
    let dateReversed = DateHelper.getHumanReadableDateReverseYYYYMMDD(date);
    expect(dateReversed).toBe(year + '-' + (month < 10 ? '0' + month : month) + '-' + (day < 10 ? '0' + day : day));
  });
});
