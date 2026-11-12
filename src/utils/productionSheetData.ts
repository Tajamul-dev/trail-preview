// Official Production Sheet Matrix and Product-Specific Production Breakdowns
// Extracted with 1:1 fidelity from:
// - Production_Sheet__2__eeae068d.pdf (Grand Total: 361.88 Pallets across 45 clients)
// - Pending_Orders_-_Olive_Oil__Blended__c1ec60bd.pdf
// - Pending_Orders_-_Mustard_Oil_aff4f2d8.pdf
// - Pending_Orders_-_Corn_Oil_a1100799.pdf
// - Pending_Orders_-_Canola_Oil_efed1c96.pdf
// - Pending_Orders_-_Avocado_Oil__Blended__acb4e8f8.pdf
// - Pending_Orders_-_Olive_Oil_-100__396db014.pdf

export interface MatrixCategoryDef {
  name: string;
  headerColor: string; // Tailwind background or hex
  textColor?: string;
  subtotal: number;
  skus: Array<{
    key: string;
    label: string;
    subtotal: number;
  }>;
}

export interface ClientMatrixRow {
  client: string;
  cells: Record<string, number>; // keyed by categoryName + '_' + skuKey
  total: number;
}

export interface ProductBreakdownSizeGroup {
  sizeTitle: string; // e.g. "Blended Olive Oil - 1 LTR" or "Mustard Oil 1L x 12"
  sizeKey: string;
  totalText: string; // e.g. "Total of 1 LTR"
  totalVal: number;
  rows: Array<{
    partyName: string;
    bottle?: string;
    brandName: string;
    pallet: number | string;
    labelStatus: string;
    remarks: string;
    isReady?: boolean;
  }>;
}

export interface ProductBreakdownDoc {
  productKey: string;
  productTitle: string;
  grandTotal: number;
  groups: ProductBreakdownSizeGroup[];
}

// 12 Official Production Categories matching Production_Sheet__2__eeae068d.pdf
export const MATRIX_CATEGORIES: MatrixCategoryDef[] = [
  {
    name: '32.5 LBS',
    headerColor: '#FFD966',
    textColor: '#000000',
    subtotal: 40,
    skus: [
      { key: 'canola', label: 'Canola', subtotal: 28.5 },
      { key: 'vegetable', label: 'Vegetable', subtotal: 6.5 },
      { key: 'soyabean', label: 'Soyabean', subtotal: 1 },
      { key: 'corn', label: 'Corn', subtotal: 4 },
    ],
  },
  {
    name: '35 LBS',
    headerColor: '#FFE699',
    textColor: '#000000',
    subtotal: 8,
    skus: [
      { key: 'canola', label: 'Canola', subtotal: 2 },
      { key: 'vegetable', label: 'Vegetable', subtotal: 2 },
      { key: 'soyabean', label: 'Soyabean', subtotal: 1 },
      { key: 'corn', label: 'Corn', subtotal: 3 },
    ],
  },
  {
    name: 'Blended Olive Oil',
    headerColor: '#ED7D31',
    textColor: '#FFFFFF',
    subtotal: 95.67,
    skus: [
      { key: '1_ltr', label: '1 LTR', subtotal: 5.67 },
      { key: '64_oz', label: '64 OZ', subtotal: 15 },
      { key: '2_ltr', label: '2 LTR', subtotal: 24 },
      { key: '3_ltr', label: '3 LTR', subtotal: 44.66 },
      { key: 'gallon', label: 'GALLON', subtotal: 6.34 },
    ],
  },
  {
    name: 'EVOO 100%',
    headerColor: '#A9D08E',
    textColor: '#000000',
    subtotal: 2.16,
    skus: [
      { key: '500_ml', label: '500 ML', subtotal: 0.66 },
      { key: '1_ltr', label: '1 LTR', subtotal: 1.5 },
    ],
  },
  {
    name: 'SUNFLOWER OIL',
    headerColor: '#FFD966',
    textColor: '#000000',
    subtotal: 33.38,
    skus: [
      { key: '1_ltr', label: '1 LTR', subtotal: 9 },
      { key: '2_ltr', label: '2 LTR', subtotal: 5 },
      { key: '3_ltr', label: '3 LTR', subtotal: 1.07 },
      { key: '5_ltr', label: '5 LTR', subtotal: 18.31 },
    ],
  },
  {
    name: 'Blended Avocado Oil',
    headerColor: '#4472C4',
    textColor: '#FFFFFF',
    subtotal: 12.66,
    skus: [
      { key: '750_ml', label: '750 ML', subtotal: 4 },
      { key: '1_ltr', label: '1 LTR', subtotal: 0.5 },
      { key: '2_ltr', label: '2 LTR', subtotal: 5.66 },
      { key: '64_oz', label: '64 OZ', subtotal: 2 },
      { key: '3_ltr', label: '3 LTR', subtotal: 0.5 },
    ],
  },
  {
    name: 'Avocado 100%',
    headerColor: '#70AD47',
    textColor: '#FFFFFF',
    subtotal: 14.20,
    skus: [
      { key: '500_ml', label: '500 ML', subtotal: 0.53 },
      { key: '750_ml', label: '750 ML', subtotal: 0 },
      { key: '2_ltr', label: '2 LTR', subtotal: 4 },
      { key: '1_ltr', label: '1 LTR', subtotal: 9.67 },
    ],
  },
  {
    name: 'Corn Oil',
    headerColor: '#B4C6E7',
    textColor: '#000000',
    subtotal: 48.84,
    skus: [
      { key: '32_oz', label: '32 OZ', subtotal: 1 },
      { key: '1_ltr', label: '1 LTR', subtotal: 1.67 },
      { key: '40_oz', label: '40 OZ', subtotal: 4.03 },
      { key: '2_ltr', label: '2 LTR', subtotal: 2.5 },
      { key: '96_oz', label: '96 OZ', subtotal: 29.37 },
      { key: '128_oz', label: '128 OZ', subtotal: 10.27 },
    ],
  },
  {
    name: 'Vegetable Oil',
    headerColor: '#F8CBAD',
    textColor: '#000000',
    subtotal: 37.69,
    skus: [
      { key: '32_oz', label: '32 OZ', subtotal: 2 },
      { key: '1_ltr', label: '1 LTR', subtotal: 9.33 },
      { key: '40_oz', label: '40 OZ', subtotal: 5.03 },
      { key: '96_oz', label: '96 OZ', subtotal: 21.33 },
      { key: '128_oz', label: '128 OZ', subtotal: 0 },
    ],
  },
  {
    name: 'Canola Oil',
    headerColor: '#BDD7EE',
    textColor: '#000000',
    subtotal: 50.69,
    skus: [
      { key: '32_oz', label: '32 OZ', subtotal: 1 },
      { key: '1_ltr', label: '1 LTR', subtotal: 9.33 },
      { key: '40_oz', label: '40 OZ', subtotal: 9.03 },
      { key: '96_oz', label: '96 OZ', subtotal: 31.33 },
      { key: '128_oz', label: '128 OZ', subtotal: 0 },
    ],
  },
  {
    name: 'HONEY',
    headerColor: '#9BC2E6',
    textColor: '#000000',
    subtotal: 13,
    skus: [
      { key: '340_gm', label: '340 GM', subtotal: 7.5 },
      { key: '227_gm', label: '227 GM', subtotal: 0 },
      { key: '16_oz', label: '16 OZ', subtotal: 3 },
      { key: '32_oz', label: '32 OZ', subtotal: 2 },
      { key: '1_kg', label: '1 kg', subtotal: 0.5 },
      { key: '80_oz', label: '80 OZ', subtotal: 0 },
    ],
  },
  {
    name: 'MUSTARD OIL',
    headerColor: '#D9D9D9',
    textColor: '#000000',
    subtotal: 5.59,
    skus: [
      { key: '250_ml', label: '250 ML', subtotal: 0.1 },
      { key: '500_ml', label: '500 ML', subtotal: 0.25 },
      { key: '1_ltr', label: '1 LTR', subtotal: 1.08 },
      { key: '2_ltr', label: '2 LTR', subtotal: 0.08 },
      { key: '5_ltr', label: '5 LTR', subtotal: 4.08 },
    ],
  },
];

// All 45 Clients with their exact cells from Production_Sheet__2__eeae068d.pdf
export const OFFICIAL_PRODUCTION_CLIENTS: ClientMatrixRow[] = [
  { client: 'Apna Wholesale', cells: { 'Blended Olive Oil_2_ltr': 2, 'SUNFLOWER OIL_1_ltr': 1, 'Corn Oil_96_oz': 1 }, total: 4 },
  { client: 'Apna Bazaar', cells: { 'Blended Olive Oil_gallon': 1 }, total: 1 },
  { client: 'Aahubarah', cells: { 'Corn Oil_128_oz': 5 }, total: 5 },
  { client: 'AVR Foods', cells: { '32.5 LBS_canola': 1 }, total: 1 },
  { client: 'Badshah Farmers - SRH', cells: { 'Blended Olive Oil_gallon': 1 }, total: 1 },
  { client: 'Bhatura king', cells: { '35 LBS_canola': 1 }, total: 1 },
  { client: 'Dara Food', cells: { 'SUNFLOWER OIL_5_ltr': 3 }, total: 3 },
  { client: 'Deshi Distribution', cells: { 'Blended Olive Oil_3_ltr': 15.66, 'Blended Avocado Oil_3_ltr': 0.5 }, total: 16.16 },
  { client: 'Delight Distribution', cells: { 'Blended Avocado Oil_2_ltr': 1, 'Corn Oil_128_oz': 1 }, total: 2 },
  { client: 'Delta Food', cells: { 'SUNFLOWER OIL_1_ltr': 1 }, total: 1 },
  { client: 'Dhaka Supermarket', cells: { '32.5 LBS_canola': 2, '32.5 LBS_vegetable': 3, '32.5 LBS_soyabean': 1, 'SUNFLOWER OIL_5_ltr': 1, 'Corn Oil_96_oz': 2, 'Corn Oil_128_oz': 2 }, total: 11 },
  { client: 'DII - Deals & Discount', cells: { 'EVOO 100%_500_ml': 0.66, 'EVOO 100%_1_ltr': 1.25, 'Avocado 100%_500_ml': 0.53, 'HONEY_1_kg': 0.5 }, total: 2.94 },
  { client: 'Dream Wholesale', cells: { 'Blended Olive Oil_3_ltr': 3, 'Blended Olive Oil_gallon': 0.29, 'SUNFLOWER OIL_5_ltr': 0.25, 'Corn Oil_96_oz': 21.33 }, total: 24.87 },
  { client: 'Elias Wholesale', cells: { 'Blended Olive Oil_2_ltr': 4, 'Blended Avocado Oil_2_ltr': 4, 'Avocado 100%_2_ltr': 4 }, total: 12 },
  { client: 'E&M Capital', cells: { 'Blended Olive Oil_64_oz': 8, 'Blended Avocado Oil_64_oz': 2 }, total: 10 },
  { client: 'Galaxy Food', cells: { '32.5 LBS_corn': 3, 'Blended Olive Oil_3_ltr': 15, 'Corn Oil_32_oz': 1, 'Corn Oil_96_oz': 4, 'Corn Oil_128_oz': 2, 'Vegetable Oil_32_oz': 1, 'Canola Oil_32_oz': 1 }, total: 27 },
  { client: 'Gitan Food', cells: { 'Blended Olive Oil_1_ltr': 3, 'Blended Olive Oil_64_oz': 6, 'Vegetable Oil_32_oz': 1 }, total: 10 },
  { client: 'Global Import & Export', cells: { 'SUNFLOWER OIL_1_ltr': 2, 'Blended Avocado Oil_750_ml': 4 }, total: 6 },
  { client: 'GURUJI BLESSINGS', cells: { 'SUNFLOWER OIL_5_ltr': 6 }, total: 6 },
  { client: 'Halal Town', cells: { 'Blended Olive Oil_2_ltr': 0.5, 'Blended Olive Oil_3_ltr': 0.5, 'Blended Olive Oil_gallon': 1, 'SUNFLOWER OIL_5_ltr': 1, 'MUSTARD OIL_5_ltr': 0.62 }, total: 3.62 },
  { client: 'India Market', cells: { '32.5 LBS_canola': 3, '32.5 LBS_vegetable': 2, '32.5 LBS_corn': 1 }, total: 6 },
  { client: 'Karam Trading', cells: { 'MUSTARD OIL_250_ml': 0.1, 'MUSTARD OIL_500_ml': 0.33, 'MUSTARD OIL_1_ltr': 0.31 }, total: 0.75 },
  { client: 'Kingsland Food', cells: { 'Blended Olive Oil_1_ltr': 1.17, 'Corn Oil_96_oz': 1 }, total: 2.17 },
  { client: 'Maharaja Farmers', cells: { 'MUSTARD OIL_1_ltr': 0.5 }, total: 0.5 },
  { client: 'Madina Supermarket', cells: { 'Blended Olive Oil_gallon': 0.05, 'SUNFLOWER OIL_3_ltr': 0.07, 'SUNFLOWER OIL_5_ltr': 0.06, 'Corn Oil_96_oz': 0.04, 'Corn Oil_128_oz': 0.06, 'MUSTARD OIL_5_ltr': 0.04 }, total: 0.32 },
  { client: 'Mannan Supermarket', cells: { '32.5 LBS_canola': 0.5, '32.5 LBS_vegetable': 0.5, 'Blended Olive Oil_3_ltr': 0.5 }, total: 1.5 },
  { client: 'More Trading', cells: { 'Blended Olive Oil_1_ltr': 0.5, 'Blended Olive Oil_2_ltr': 0.5, 'EVOO 100%_1_ltr': 0.25, 'Blended Avocado Oil_1_ltr': 0.5, 'Blended Avocado Oil_2_ltr': 0.5 }, total: 2.25 },
  { client: 'Ny Zara Food', cells: { 'MUSTARD OIL_250_ml': 0.1, 'MUSTARD OIL_500_ml': 0.15, 'MUSTARD OIL_1_ltr': 0.25, 'MUSTARD OIL_2_ltr': 0.08, 'MUSTARD OIL_5_ltr': 0.10 }, total: 0.69 },
  { client: 'Nassau Provisions', cells: { '35 LBS_canola': 1, '35 LBS_soyabean': 1, 'Avocado 100%_1_ltr': 6.67, 'Canola Oil_96_oz': 10, 'HONEY_340_gm': 7.5, 'HONEY_16_oz': 3, 'HONEY_32_oz': 2 }, total: 31.17 },
  { client: 'Ocean State Jobbers', cells: { 'Corn Oil_40_oz': 4, 'Vegetable Oil_40_oz': 5, 'Canola Oil_40_oz': 9 }, total: 18.00 },
  { client: 'Ontime Distribution', cells: { 'Blended Olive Oil_2_ltr': 5, 'Blended Olive Oil_3_ltr': 5 }, total: 10.00 },
  { client: 'Pocono Food', cells: { 'Avocado 100%_1_ltr': 3 }, total: 3 },
  { client: 'Pure Farmers', cells: { 'Blended Avocado Oil_2_ltr': 0.16, 'Corn Oil_128_oz': 0.21 }, total: 0.37 },
  { client: 'Roshni Foods', cells: { '32.5 LBS_corn': 3 }, total: 3 },
  { client: 'R and M Variety', cells: { 'Blended Olive Oil_2_ltr': 1, 'Blended Olive Oil_3_ltr': 1, 'SUNFLOWER OIL_5_ltr': 1 }, total: 3 },
  { client: 'Sanjha Punjab', cells: { '32.5 LBS_canola': 1, '32.5 LBS_vegetable': 1, 'Blended Olive Oil_2_ltr': 1, 'SUNFLOWER OIL_5_ltr': 1, 'Corn Oil_40_oz': 0.03, 'Vegetable Oil_40_oz': 0.03, 'Canola Oil_40_oz': 0.03, 'MUSTARD OIL_5_ltr': 1 }, total: 5.09 },
  { client: 'Suncrop Food', cells: { 'Blended Olive Oil_1_ltr': 1 }, total: 1 },
  { client: 'Sunderban Halal', cells: { '35 LBS_vegetable': 2 }, total: 2 },
  { client: 'Tri-State Food', cells: { 'Blended Olive Oil_2_ltr': 10, 'Blended Olive Oil_3_ltr': 4 }, total: 14 },
  { client: 'USA Nationwide - 691 Co-Op City', cells: { 'Blended Olive Oil_1_ltr': 1 }, total: 1 },
  { client: 'Vibrant Food', cells: { '32.5 LBS_canola': 20, 'SUNFLOWER OIL_1_ltr': 5, 'SUNFLOWER OIL_2_ltr': 5, 'SUNFLOWER OIL_5_ltr': 1, 'Corn Oil_1_ltr': 1.67, 'Corn Oil_2_ltr': 2.5, 'Vegetable Oil_1_ltr': 9.33, 'Vegetable Oil_96_oz': 21.33, 'Canola Oil_1_ltr': 9.33, 'Canola Oil_96_oz': 21.33 }, total: 96.49 },
  { client: 'Villager Wholesale', cells: { 'SUNFLOWER OIL_5_ltr': 5 }, total: 5 },
  { client: 'Villager Farmers - Coney Island', cells: { 'Blended Olive Oil_gallon': 1, 'MUSTARD OIL_5_ltr': 1 }, total: 2 },
  { client: 'Villager Farmers - Liberty Ave', cells: { 'Blended Olive Oil_gallon': 1 }, total: 1 },
  { client: 'Villager Farmers - Hicksville', cells: { '32.5 LBS_canola': 1, 'Blended Olive Oil_gallon': 1, 'MUSTARD OIL_5_ltr': 1 }, total: 3 },
];

export const PRODUCTION_GRAND_TOTAL = 361.88;

// Official Product Production Sheet Breakdowns matching Pending_Orders_-_*.pdf
export const OFFICIAL_PRODUCT_DOCS: Record<string, ProductBreakdownDoc> = {
  blended_olive_oil: {
    productKey: 'blended_olive_oil',
    productTitle: 'Olive Oil (Blended)',
    grandTotal: 95.67,
    groups: [
      {
        sizeTitle: 'Blended Olive Oil - 1 LTR',
        sizeKey: '1_ltr',
        totalText: 'Total of 1 LTR',
        totalVal: 5.67,
        rows: [
          { partyName: 'Kingsland Food', bottle: 'Green Bottle', brandName: 'Futura', pallet: 1.17, labelStatus: 'Available', remarks: 'to be ready' },
          { partyName: 'More Trading', bottle: 'Green Bottle', brandName: 'Futura', pallet: 0.5, labelStatus: 'Available', remarks: 'to be ready' },
          { partyName: 'Gitan Food', bottle: 'Green Bottle', brandName: 'VIOLA DB GITAN', pallet: 3, labelStatus: 'Available', remarks: 'to be ready' },
          { partyName: 'SunCrop Foods LLC', bottle: 'Green Bottle', brandName: 'Suncrop Foods', pallet: 1, labelStatus: 'Available', remarks: 'to be ready' },
        ],
      },
      {
        sizeTitle: 'Blended Olive Oil - 2 LTR',
        sizeKey: '2_ltr',
        totalText: 'Total of 2 LTR',
        totalVal: 24,
        rows: [
          { partyName: 'Apna Wholesales', bottle: 'Green Bottle', brandName: 'Futura', pallet: 2, labelStatus: 'Available', remarks: 'ready', isReady: true },
          { partyName: 'More Trading', bottle: 'Green Bottle', brandName: 'Futura', pallet: 0.5, labelStatus: 'Available', remarks: 'ready', isReady: true },
          { partyName: 'Sanjha Punjab', bottle: 'Green Bottle', brandName: 'Futura', pallet: 1, labelStatus: 'Available', remarks: 'ready', isReady: true },
          { partyName: 'Elias Wholesale', bottle: 'CLEAR BOTTLE', brandName: 'ELIAS', pallet: 4, labelStatus: 'Not Available', remarks: 'Label Pending' },
          { partyName: 'Tri-State Food', bottle: 'Green Bottle(India)', brandName: 'Solena', pallet: 10, labelStatus: 'Available', remarks: 'to be ready' },
          { partyName: 'R and M Variety', bottle: 'Green', brandName: 'Futura', pallet: 1, labelStatus: 'Available', remarks: 'to be ready' },
          { partyName: 'Ontime Distribution', bottle: 'Green', brandName: 'Metro', pallet: 5, labelStatus: 'Available', remarks: 'to be ready' },
          { partyName: 'Halal Town', bottle: 'Green', brandName: 'Futura', pallet: 0.5, labelStatus: 'Available', remarks: 'to be ready' },
        ],
      },
      {
        sizeTitle: 'Blended Olive Oil - 64 OZ',
        sizeKey: '64_oz',
        totalText: 'Total of 64 OZ',
        totalVal: 15,
        rows: [
          { partyName: 'Gitan Food', bottle: 'Green Bottle', brandName: 'New Label', pallet: 6, labelStatus: 'Available', remarks: 'to be ready' },
          { partyName: 'USA Nationwide - 691 Co-Op City', bottle: 'Green Bottle', brandName: 'Futura', pallet: 1, labelStatus: 'Available', remarks: 'to be ready' },
          { partyName: 'E&M Capital Distributors', bottle: 'Green Bottle', brandName: 'BUEN PROVECHO', pallet: 8, labelStatus: 'Not Available', remarks: 'Label Pending' },
        ],
      },
      {
        sizeTitle: 'Blended Olive Oil - 3 LTR',
        sizeKey: '3_ltr',
        totalText: 'Total of 3 LTR',
        totalVal: 46.66,
        rows: [
          { partyName: 'Deshi Distributors', bottle: 'Transparent', brandName: 'SHAHI', pallet: 7, labelStatus: 'Available', remarks: 'to be ready' },
          { partyName: 'Deshi Distributors', bottle: 'Transparent', brandName: 'SHAHI', pallet: 0.66, labelStatus: 'Available', remarks: 'to be ready' },
          { partyName: 'Deshi Distributors', bottle: 'Transparent', brandName: 'SHAHI', pallet: 8, labelStatus: 'Available', remarks: 'to be ready' },
          { partyName: 'Mannan Supermarket', bottle: 'Green Bottle', brandName: 'Futura', pallet: 0.5, labelStatus: 'Available', remarks: 'Ready', isReady: true },
          { partyName: 'Galaxy Foods', bottle: 'Green Bottle', brandName: 'Zeina', pallet: 2, labelStatus: 'Available', remarks: 'to be ready' },
          { partyName: 'Galaxy Foods', bottle: 'Green Bottle', brandName: 'Zeina', pallet: 13, labelStatus: 'Available', remarks: 'to be ready' },
          { partyName: 'Dream Wholesale', bottle: 'Clear Bottle', brandName: 'Zaady', pallet: 3, labelStatus: 'Available', remarks: 'to be ready' },
          { partyName: 'Tri-State Food', bottle: 'Green Bottle(India)', brandName: 'Solena', pallet: 6, labelStatus: 'Available', remarks: 'to be ready' },
          { partyName: 'R and M Variety', bottle: 'Green', brandName: 'Futura', pallet: 1, labelStatus: 'Available', remarks: 'to be ready' },
          { partyName: 'Ontime Distribution', bottle: 'Green', brandName: 'Metro', pallet: 5, labelStatus: 'Available', remarks: 'to be ready' },
          { partyName: 'Halal Town', bottle: 'Green', brandName: 'Futura', pallet: 0.5, labelStatus: 'Available', remarks: 'to be ready' },
        ],
      },
      {
        sizeTitle: 'Blended Olive Oil - 1 Gallon',
        sizeKey: 'gallon',
        totalText: 'Total of 1 Gallon',
        totalVal: 6.34,
        rows: [
          { partyName: 'Madina Mini Supermarket', bottle: 'Tin', brandName: 'Futura', pallet: 0.05, labelStatus: 'Available', remarks: 'Ready', isReady: true },
          { partyName: 'Dream Wholesale', bottle: 'Tin', brandName: 'Futura', pallet: 0.29, labelStatus: 'Available', remarks: 'Ready', isReady: true },
          { partyName: 'Villager Farmers - Hicksville', bottle: 'Tin', brandName: 'Futura', pallet: 1, labelStatus: 'Available', remarks: 'Ready', isReady: true },
          { partyName: 'Apna Bazaar', bottle: 'Tin', brandName: 'Futura', pallet: 1, labelStatus: 'Available', remarks: 'Ready', isReady: true },
          { partyName: 'Villager Farmers (Coney Island)', bottle: 'Tin', brandName: 'Futura', pallet: 1, labelStatus: 'Available', remarks: 'Ready', isReady: true },
          { partyName: 'Villager Farmers (Liberty Ave)', bottle: 'Tin', brandName: 'Futura', pallet: 1, labelStatus: 'Available', remarks: 'Ready', isReady: true },
          { partyName: 'Badshah Farmers - SRH', bottle: 'Tin', brandName: 'Futura', pallet: 1, labelStatus: 'Available', remarks: 'Ready', isReady: true },
          { partyName: 'Halal Town', bottle: 'Tin', brandName: 'Futura', pallet: 1, labelStatus: 'Available', remarks: 'Ready', isReady: true },
          { partyName: 'Apna Wholesales', bottle: 'Tin', brandName: 'Futura', pallet: '1 x 40 HQ', labelStatus: 'Available', remarks: 'Ready', isReady: true },
        ],
      },
    ],
  },

  mustard_oil: {
    productKey: 'mustard_oil',
    productTitle: 'Mustard Oil',
    grandTotal: 5.59,
    groups: [
      {
        sizeTitle: 'Mustard Oil 250ml x 24',
        sizeKey: '250_ml',
        totalText: 'Total 250 ml',
        totalVal: 0.10,
        rows: [
          { partyName: 'NY ZARA FOOD', brandName: 'Rajdhani', pallet: 0.1, labelStatus: 'Available', remarks: 'Ready', isReady: true },
        ],
      },
      {
        sizeTitle: 'Mustard Oil 500ml x 12',
        sizeKey: '500_ml',
        totalText: 'Total 500 ml',
        totalVal: 0.25,
        rows: [
          { partyName: 'Karam Trading', brandName: 'Rajdhani', pallet: 0.1, labelStatus: 'Available', remarks: 'Ready', isReady: true },
          { partyName: 'NY ZARA FOOD', brandName: 'Rajdhani', pallet: 0.15, labelStatus: 'Available', remarks: 'Ready', isReady: true },
        ],
      },
      {
        sizeTitle: 'Mustard Oil 1L x 12',
        sizeKey: '1_ltr',
        totalText: 'Total of 1 LTR',
        totalVal: 1.08,
        rows: [
          { partyName: 'Karam Trading', brandName: 'Rajdhani', pallet: 0.33, labelStatus: 'Available', remarks: 'Ready', isReady: true },
          { partyName: 'NY ZARA FOOD', brandName: 'Rajdhani', pallet: 0.25, labelStatus: 'Available', remarks: 'Ready', isReady: true },
          { partyName: 'Maharaja Farmers', brandName: 'Rajdhani', pallet: 0.5, labelStatus: 'Available', remarks: 'Ready', isReady: true },
        ],
      },
      {
        sizeTitle: 'Mustard Oil 2L x 6',
        sizeKey: '2_ltr',
        totalText: 'Total 2L',
        totalVal: 0.08,
        rows: [
          { partyName: 'NY ZARA FOOD', brandName: 'Rajdhani', pallet: 0.08, labelStatus: 'Available', remarks: 'Ready', isReady: true },
        ],
      },
      {
        sizeTitle: 'Mustard Oil 5L x 4',
        sizeKey: '5_ltr',
        totalText: 'Total of 5 LTR',
        totalVal: 4.08,
        rows: [
          { partyName: 'Madina Mini supermarket', brandName: 'Rajdhani', pallet: 0.04, labelStatus: 'Available', remarks: 'Ready', isReady: true },
          { partyName: 'Karam Trading', brandName: 'Rajdhani', pallet: 0.31, labelStatus: 'Available', remarks: 'Ready', isReady: true },
          { partyName: 'NY ZARA FOOD', brandName: 'Rajdhani', pallet: 0.10, labelStatus: 'Available', remarks: 'Ready', isReady: true },
          { partyName: 'Villager Farmers (Hicksville)', brandName: 'Rajdhani', pallet: 1.00, labelStatus: 'Available', remarks: 'Ready', isReady: true },
          { partyName: 'Sanjha Punjab', brandName: 'Rajdhani', pallet: 1.00, labelStatus: 'Available', remarks: 'Ready', isReady: true },
          { partyName: 'Villager Farmers (Coney Island)', brandName: 'Rajdhani', pallet: 1.00, labelStatus: 'Available', remarks: 'Ready', isReady: true },
          { partyName: 'Halal Town', brandName: 'Rajdhani', pallet: 0.62, labelStatus: 'Available', remarks: 'Ready', isReady: true },
        ],
      },
    ],
  },

  corn_oil: {
    productKey: 'corn_oil',
    productTitle: 'Corn Oil',
    grandTotal: 48.84,
    groups: [
      {
        sizeTitle: 'Corn Oil 32 Fl x 12',
        sizeKey: '32_oz',
        totalText: 'Total 32 Fl oz',
        totalVal: 1,
        rows: [
          { partyName: 'Galaxy Food', brandName: 'Galaxy', pallet: 1, labelStatus: 'Available', remarks: 'to be ready' },
        ],
      },
      {
        sizeTitle: 'Corn Oil 1ltr x 12',
        sizeKey: '1_ltr',
        totalText: 'Total 1 ltr',
        totalVal: 1.67,
        rows: [
          { partyName: 'Vibrant Food', brandName: 'Ashoka', pallet: 1.67, labelStatus: 'Available', remarks: 'Printing files pending by Customer' },
        ],
      },
      {
        sizeTitle: 'Corn Oil 40 Fl x 12',
        sizeKey: '40_oz',
        totalText: 'Total 40 Fl oz',
        totalVal: 4.03,
        rows: [
          { partyName: 'Sanjha Punjab', brandName: 'Futura', pallet: 0.03, labelStatus: 'Available', remarks: 'to be ready' },
          { partyName: 'Ocean State Jobbers', brandName: 'Futura', pallet: 4.00, labelStatus: 'Available', remarks: 'to be ready' },
        ],
      },
      {
        sizeTitle: 'Corn Oil 2ltr x 6',
        sizeKey: '2_ltr',
        totalText: 'Total 2 ltr',
        totalVal: 2.50,
        rows: [
          { partyName: 'Vibrant Food', brandName: 'Ashoka', pallet: 2.50, labelStatus: 'Available', remarks: 'Printing files pending by Customer' },
        ],
      },
      {
        sizeTitle: 'Corn Oil 96 Fl x 6',
        sizeKey: '96_oz',
        totalText: 'Total of 96 Oz',
        totalVal: 29.37,
        rows: [
          { partyName: 'Apna Wholesale', brandName: 'Paras', pallet: 1, labelStatus: 'Available', remarks: 'To be Ready' },
          { partyName: 'Madina Mini Supermarket', brandName: 'Futura', pallet: 0.04, labelStatus: 'Available', remarks: 'To be Ready' },
          { partyName: 'Galaxy Food', brandName: 'Galaxy', pallet: 4, labelStatus: 'Available', remarks: 'to be ready' },
          { partyName: 'Dhaka Supermarket', brandName: 'Futura', pallet: 2, labelStatus: 'Available', remarks: 'To be Ready' },
          { partyName: 'Kingsland Food', brandName: 'Futura', pallet: 1, labelStatus: 'Available', remarks: 'To be Ready' },
          { partyName: 'Dream Wholesale', brandName: 'Futura', pallet: 13.33, labelStatus: 'Available', remarks: 'To be Ready' },
          { partyName: 'Dream Wholesale', brandName: 'Futura', pallet: 8, labelStatus: 'Available', remarks: 'To be Ready' },
        ],
      },
      {
        sizeTitle: 'Corn 128 Fl x 4',
        sizeKey: '128_oz',
        totalText: 'Total of 128 Oz',
        totalVal: 10.27,
        rows: [
          { partyName: 'Delight Distribution', brandName: 'Futura', pallet: 1, labelStatus: 'Available', remarks: 'To be ready' },
          { partyName: 'Madina Mini Supermarket', brandName: 'Futura', pallet: 0.06, labelStatus: 'Available', remarks: 'To be ready' },
          { partyName: 'Aahu Barah Inc', brandName: 'Aahu Barah', pallet: 5, labelStatus: 'Not final', remarks: 'Label not finalised by Piyush' },
          { partyName: 'Galaxy Food', brandName: 'Galaxy', pallet: 2, labelStatus: 'Not Available', remarks: 'Label need to check in WH' },
          { partyName: 'Dhaka Supermarket', brandName: 'Futura', pallet: 2, labelStatus: 'Available', remarks: 'To be Ready' },
          { partyName: 'Pure Farmers Market', brandName: 'Futura', pallet: 0.21, labelStatus: 'Available', remarks: 'To be Ready' },
        ],
      },
    ],
  },

  canola_oil: {
    productKey: 'canola_oil',
    productTitle: 'Canola Oil',
    grandTotal: 50.69,
    groups: [
      {
        sizeTitle: 'Canola Oil 32 Fl oz x 12',
        sizeKey: '32_oz',
        totalText: 'Total 32 Fl oz',
        totalVal: 1,
        rows: [
          { partyName: 'Galaxy Food', brandName: 'Galaxy', pallet: 1, labelStatus: 'Available', remarks: 'Label need to check in WH' },
        ],
      },
      {
        sizeTitle: 'Canola Oil 1LTR x 12',
        sizeKey: '1_ltr',
        totalText: 'Total 1 LTR',
        totalVal: 9.33,
        rows: [
          { partyName: 'Vibrant Food', brandName: 'Ashoka', pallet: 9.33, labelStatus: 'Not', remarks: 'Label Not Final' },
        ],
      },
      {
        sizeTitle: 'Canola Oil 40 Fl oz x 12',
        sizeKey: '40_oz',
        totalText: 'Total 40 Fl oz',
        totalVal: 9.03,
        rows: [
          { partyName: 'Sanjha Punjab', brandName: 'Futura', pallet: 0.03, labelStatus: 'Available', remarks: 'to be ready' },
          { partyName: 'Ocean State Jobbers', brandName: 'Futura', pallet: 9.00, labelStatus: 'Available', remarks: 'to be ready' },
        ],
      },
      {
        sizeTitle: 'Canola Oil 96 Fl oz x 6',
        sizeKey: '96_oz',
        totalText: 'Total 96 Fl oz',
        totalVal: 31.33,
        rows: [
          { partyName: 'Nassau Provisions', brandName: 'Simply Lev', pallet: 10.00, labelStatus: 'Not', remarks: 'Label Not Final' },
          { partyName: 'Vibrant Food', brandName: 'Ashoka', pallet: 21.33, labelStatus: 'Not', remarks: 'Label Not Final' },
        ],
      },
    ],
  },

  blended_avocado_oil: {
    productKey: 'blended_avocado_oil',
    productTitle: 'Blended Avocado Oil',
    grandTotal: 12.66,
    groups: [
      {
        sizeTitle: 'Blended Avocado Oil (750 ML)',
        sizeKey: '750_ml',
        totalText: 'Total of 750 ML',
        totalVal: 4,
        rows: [
          { partyName: 'GLOBAL IMPORT AND EXPORT', bottle: 'Glass Bottle', brandName: 'PRIVATE LABEL CETU MOUNTANA', pallet: 4, labelStatus: 'Available', remarks: 'to be ready' },
        ],
      },
      {
        sizeTitle: 'Blended Avocado Oil (1 LTR)',
        sizeKey: '1_ltr',
        totalText: 'Total of 1 LTR',
        totalVal: 0.5,
        rows: [
          { partyName: 'More Trading', bottle: 'Glass Bottle', brandName: 'Futura', pallet: 0.5, labelStatus: 'Available', remarks: 'to be ready' },
        ],
      },
      {
        sizeTitle: 'Blended Avocado Oil (2 LTR)',
        sizeKey: '2_ltr',
        totalText: 'Total of 2 LTR',
        totalVal: 5.67,
        rows: [
          { partyName: 'Delight Distribution', bottle: 'Green Bottle', brandName: 'Futura', pallet: 1, labelStatus: 'Available', remarks: 'to be ready' },
          { partyName: 'Elias Wholesale', bottle: 'CLEAR BOTTLE', brandName: 'ELIAS', pallet: 4, labelStatus: 'Available', remarks: 'Label Pending' },
          { partyName: 'Pure Farmers', bottle: 'Green Bottle', brandName: 'Futura', pallet: 0.167, labelStatus: 'Available', remarks: 'to be ready' },
          { partyName: 'More Trading', bottle: 'Green Bottle', brandName: 'Futura', pallet: 0.5, labelStatus: 'Available', remarks: 'to be ready' },
        ],
      },
      {
        sizeTitle: 'Blended Avocado Oil (64 OZ)',
        sizeKey: '64_oz',
        totalText: 'Total of 64 OZ',
        totalVal: 2,
        rows: [
          { partyName: 'E&M Capital Distributors', bottle: 'Green Bottle', brandName: 'BUEN PROVECHO', pallet: 2, labelStatus: 'Not Available', remarks: 'Label Pending' },
        ],
      },
      {
        sizeTitle: 'Blended Avocado Oil (3 LTR)',
        sizeKey: '3_ltr',
        totalText: 'Total of 3 LTR',
        totalVal: 0.5,
        rows: [
          { partyName: 'Deshi Distributors', bottle: 'Transparent Bottle', brandName: 'SHAHI', pallet: 0.5, labelStatus: 'Available', remarks: 'to be ready' },
        ],
      },
    ],
  },

  evoo_100: {
    productKey: 'evoo_100',
    productTitle: 'EVOO 100%',
    grandTotal: 2.16,
    groups: [
      {
        sizeTitle: 'EVOO 100% (500 ML)',
        sizeKey: '500_ml',
        totalText: 'Total of 500 ML',
        totalVal: 0.66,
        rows: [
          { partyName: 'DII - Deals & Discounts', bottle: 'Glass Bottle', brandName: 'Futura', pallet: 0.66, labelStatus: 'Available', remarks: 'to be ready' },
        ],
      },
      {
        sizeTitle: 'EVOO 100% (1 LTR)',
        sizeKey: '1_ltr',
        totalText: 'Total of 1 LTR',
        totalVal: 1.5,
        rows: [
          { partyName: 'More Trading', bottle: 'Glass Bottle', brandName: 'Futura', pallet: 0.25, labelStatus: 'Available', remarks: 'to be ready' },
          { partyName: 'DII - Deals & Discounts', bottle: 'Glass Bottle', brandName: 'Futura', pallet: 1.25, labelStatus: 'Available', remarks: 'to be ready' },
        ],
      },
    ],
  },

  sunflower_oil: {
    productKey: 'sunflower_oil',
    productTitle: 'Sunflower Oil',
    grandTotal: 33.38,
    groups: [
      {
        sizeTitle: 'Sunflower Oil - 1 LTR',
        sizeKey: '1_ltr',
        totalText: 'Total of 1 LTR',
        totalVal: 9,
        rows: [
          { partyName: 'Apna Wholesale', brandName: 'Paras', pallet: 1, labelStatus: 'Available', remarks: 'Stock Not Available' },
          { partyName: 'Global Import & Export', brandName: 'Cetu Mountana', pallet: 2, labelStatus: 'Available', remarks: 'to be ready' },
          { partyName: 'Delta Food', brandName: 'Delta Food', pallet: 1, labelStatus: 'Available', remarks: 'Stock not Available' },
          { partyName: 'Vibrant Food', brandName: 'Ashoka', pallet: 5, labelStatus: 'Available', remarks: 'Printing files pending by Customer' },
        ],
      },
      {
        sizeTitle: 'Sunflower Oil - 2 LTR',
        sizeKey: '2_ltr',
        totalText: 'Total of 2 LTR',
        totalVal: 5,
        rows: [
          { partyName: 'Vibrant Food', brandName: 'Ashoka', pallet: 5, labelStatus: 'Available', remarks: 'Printing files pending by Customer' },
        ],
      },
      {
        sizeTitle: 'Sunflower Oil - 3 LTR',
        sizeKey: '3_ltr',
        totalText: 'Total of 3 LTR',
        totalVal: 1.07,
        rows: [
          { partyName: 'Madina Supermarket', brandName: 'Futura', pallet: 0.07, labelStatus: 'Available', remarks: 'Stock Not Available' },
          { partyName: 'Sanjha Punjab', brandName: 'Futura', pallet: 1, labelStatus: 'Available', remarks: 'bottle not available' },
        ],
      },
      {
        sizeTitle: 'Sunflower Oil - 5 LTR',
        sizeKey: '5_ltr',
        totalText: 'Total of 5 LTR',
        totalVal: 18.31,
        rows: [
          { partyName: 'Dhaka Supermarket', brandName: 'Futura', pallet: 1, labelStatus: 'Available', remarks: 'Ready', isReady: true },
          { partyName: 'Dara Food', brandName: 'Futura', pallet: 3, labelStatus: 'Available', remarks: 'Ready', isReady: true },
          { partyName: 'GURUJI BLESSINGS', brandName: 'Guruji', pallet: 6, labelStatus: 'Available', remarks: 'to be ready' },
          { partyName: 'Madina Supermarket', brandName: 'Futura', pallet: 0.06, labelStatus: 'Available', remarks: 'Ready', isReady: true },
          { partyName: 'Dream Wholesale', brandName: 'Futura', pallet: 0.25, labelStatus: 'Available', remarks: 'Ready', isReady: true },
          { partyName: 'Villager Wholesale', brandName: 'Futura', pallet: 5, labelStatus: 'Available', remarks: 'Ready', isReady: true },
          { partyName: 'Halal Town', brandName: 'Futura', pallet: 1, labelStatus: 'Available', remarks: 'ready', isReady: true },
          { partyName: 'R and M Variety', brandName: 'Futura', pallet: 1, labelStatus: 'Available', remarks: 'ready', isReady: true },
          { partyName: 'Vibrant Food', brandName: 'Ashoka', pallet: 1, labelStatus: 'Available', remarks: 'to be ready' },
        ],
      },
    ],
  },
};
