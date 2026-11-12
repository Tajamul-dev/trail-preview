import React, { useEffect, useRef, useState, useMemo } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import {
  Truck,
  Upload,
  Loader2,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  MapPin,
  UserCheck,
  FileText,
  FileSpreadsheet,
  ImageIcon,
  Edit3,
  Plus,
  Download,
  Printer,
  Search,
  Filter,
  RotateCcw,
  Eye,
  X,
  ExternalLink,
  ChevronDown,
  Check,
  Layers,
  Factory,
  Boxes,
  Sparkles,
} from 'lucide-react';
import { PendingDeliveryOrder, PendingDeliveryItem } from '../types';
import { SoundEngine } from '../utils/audio';
import { idbGet, idbSet, migrateFromLS } from '../utils/idbStore';
import {
  OFFICIAL_PENDING_DELIVERIES,
  TODAYS_PRODUCTION_PLAN,
  TODAYS_DELIVERY_PLAN,
  GOODS_PICKUP_DATA,
  GoodsPickupItem,
} from '../utils/pendingDeliveriesData';
import {
  MATRIX_CATEGORIES,
  OFFICIAL_PRODUCTION_CLIENTS,
  PRODUCTION_GRAND_TOTAL,
  OFFICIAL_PRODUCT_DOCS,
  ProductBreakdownDoc,
} from '../utils/productionSheetData';

const STORAGE_KEY = 'gfi_pending_deliveries_v3';
const PDF_SOURCE_PATH = '/assets/aistudio/Pending_Deliveries_-_11.12.2026__3__c2e1fa06.pdf';
const PROD_PDF_PATH = '/assets/aistudio/Production_Sheet__2__eeae068d.pdf';
const HEADER_LOGO_PATH = '/assets/deliveries/page_1_img_p0_1_405x112.png';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerSrc;

export const PendingDeliveriesSection: React.FC<{ onNotify?: (msg: string) => void }> = ({ onNotify }) => {
  // Main orders state initialized from IndexedDB or the official 11.12.2026 PDF dataset
  const [orders, setOrders] = useState<PendingDeliveryOrder[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
    return OFFICIAL_PENDING_DELIVERIES;
  });

  const [pickupItems, setPickupItems] = useState<GoodsPickupItem[]>(() => {
    try {
      const saved = localStorage.getItem('gfi_pickup_items_v3');
      if (saved) return JSON.parse(saved);
    } catch {}
    return GOODS_PICKUP_DATA;
  });

  // Active view tab: Deliveries Sheet, Production Dept Matrix, Product Breakdown, Customer Pickups
  const [activeTab, setActiveTab] = useState<'sheet' | 'matrix' | 'product_breakdown' | 'pickups'>('sheet');

  // Multi-facet filter states
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRegion, setSelectedRegion] = useState<string>('all');
  const [selectedProduct, setSelectedProduct] = useState<string>('all');
  const [selectedExecutive, setSelectedExecutive] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'ready' | 'to_be_ready' | 'out_of_stock' | 'label_pending'>('all');
  const [selectedCustomer, setSelectedCustomer] = useState<string>('all');

  // UI & Edit States
  const [isEditable, setIsEditable] = useState(false);
  const [previewImage, setPreviewImage] = useState<{ src: string; title: string } | null>(null);
  const [showPdfModal, setShowPdfModal] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [downloadMenuOpen, setDownloadMenuOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Sync to IndexedDB
  useEffect(() => {
    (async () => {
      const saved = await migrateFromLS<PendingDeliveryOrder[]>(STORAGE_KEY);
      if (saved && Array.isArray(saved) && saved.length > 0) {
        setOrders(saved);
      } else {
        idbSet(STORAGE_KEY, OFFICIAL_PENDING_DELIVERIES);
      }
    })();
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      idbSet(STORAGE_KEY, orders);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(orders));
      } catch {}
    }, 400);
    return () => clearTimeout(t);
  }, [orders]);

  useEffect(() => {
    try {
      localStorage.setItem('gfi_pickup_items_v3', JSON.stringify(pickupItems));
    } catch {}
  }, [pickupItems]);

  // Product categories list for quick filtering
  const PRODUCT_FILTER_OPTIONS: Array<{ key: string; label: string; docKey?: string }> = [
    { key: 'all', label: 'All Products' },
    { key: 'blended_olive_oil', label: 'Olive Oil (Blended)', docKey: 'blended_olive_oil' },
    { key: 'corn_oil', label: 'Corn Oil', docKey: 'corn_oil' },
    { key: 'canola_oil', label: 'Canola Oil', docKey: 'canola_oil' },
    { key: 'mustard_oil', label: 'Mustard Oil', docKey: 'mustard_oil' },
    { key: 'sunflower_oil', label: 'Sunflower Oil', docKey: 'sunflower_oil' },
    { key: 'blended_avocado_oil', label: 'Blended Avocado Oil', docKey: 'blended_avocado_oil' },
    { key: 'evoo_100', label: 'EVOO 100%', docKey: 'evoo_100' },
    { key: 'vegetable_oil', label: 'Vegetable Oil' },
    { key: 'honey', label: 'Honey' },
    { key: '32.5_lbs', label: '32.5 LBS Tins' },
    { key: '35_lbs', label: '35 LBS Tins' },
  ];

  // Distinct Sales Executives list
  const salesExecutives = useMemo(() => {
    const set = new Set<string>();
    orders.forEach(o => {
      if (o.salesExecutive?.trim()) set.add(o.salesExecutive.trim());
    });
    return Array.from(set).sort();
  }, [orders]);

  // Distinct Customers list
  const customerNames = useMemo(() => {
    const set = new Set<string>();
    orders.forEach(o => {
      if (o.customerName?.trim()) set.add(o.customerName.trim());
    });
    return Array.from(set).sort();
  }, [orders]);

  // Regions list
  const REGION_ORDER: Array<'Bronx' | 'Brooklyn' | 'New Jersey' | 'Others' | 'Philadelphia'> = [
    'Bronx',
    'Brooklyn',
    'New Jersey',
    'Others',
    'Philadelphia',
  ];

  // Match item to product filter key
  const matchProductKey = (itemText: string): string => {
    const t = itemText.toLowerCase();
    if (t.includes('mustard')) return 'mustard_oil';
    if (t.includes('honey')) return 'honey';
    if (t.includes('evoo')) return 'evoo_100';
    if (t.includes('blended olive') || (t.includes('olive') && t.includes('blended'))) return 'blended_olive_oil';
    if (t.includes('blended avocado') || (t.includes('avocado') && t.includes('blended'))) return 'blended_avocado_oil';
    if (t.includes('corn')) return 'corn_oil';
    if (t.includes('canola')) return 'canola_oil';
    if (t.includes('sunflower')) return 'sunflower_oil';
    if (t.includes('vegetable') || t.includes('xlfry')) return 'vegetable_oil';
    if (t.includes('32.5')) return '32.5_lbs';
    if (t.includes('35 lb')) return '35_lbs';
    return 'other';
  };

  // Comprehensive Filtering
  const filteredOrders = useMemo(() => {
    return orders.filter(o => {
      // Region filter
      if (selectedRegion !== 'all' && o.region !== selectedRegion) return false;

      // Executive filter
      if (selectedExecutive !== 'all' && o.salesExecutive !== selectedExecutive) return false;

      // Customer filter
      if (selectedCustomer !== 'all' && o.customerName !== selectedCustomer) return false;

      // Universal search term
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const matchesOrder =
          o.doNo.toLowerCase().includes(q) ||
          o.customerName.toLowerCase().includes(q) ||
          o.salesExecutive.toLowerCase().includes(q) ||
          o.address.toLowerCase().includes(q) ||
          (o.calloutBox || '').toLowerCase().includes(q) ||
          (o.calloutBanner || '').toLowerCase().includes(q) ||
          o.items.some(
            it =>
              it.item.toLowerCase().includes(q) ||
              it.brand.toLowerCase().includes(q) ||
              (it.description || '').toLowerCase().includes(q) ||
              it.remarks.toLowerCase().includes(q) ||
              it.qty.toLowerCase().includes(q)
          );
        if (!matchesOrder) return false;
      }

      // Product filter
      if (selectedProduct !== 'all') {
        const hasProduct = o.items.some(it => {
          const key = matchProductKey(it.item);
          if (selectedProduct === '32.5_lbs') return (it.description || '').includes('32.5');
          if (selectedProduct === '35_lbs') return (it.description || '').includes('35');
          return key === selectedProduct;
        });
        if (!hasProduct) return false;
      }

      // Status filter
      if (statusFilter !== 'all') {
        const hasMatchingItem = o.items.some(it => {
          const isReady = it.isReady || /ready/i.test(it.remarks);
          if (statusFilter === 'ready') return isReady;
          if (statusFilter === 'to_be_ready') return /to be ready/i.test(it.remarks);
          if (statusFilter === 'out_of_stock') return /stock not available/i.test(it.remarks) || /bottle not available/i.test(it.remarks);
          if (statusFilter === 'label_pending') return /label/i.test(it.remarks) || /printing/i.test(it.remarks) || it.specialBadge === 'Without Label';
          return true;
        });
        if (!hasMatchingItem) return false;
      }

      return true;
    });
  }, [orders, selectedRegion, selectedExecutive, selectedCustomer, searchTerm, selectedProduct, statusFilter]);

  // Group filtered orders by region
  const ordersByRegion = useMemo(() => {
    const map = new Map<string, PendingDeliveryOrder[]>();
    REGION_ORDER.forEach(r => map.set(r, []));
    filteredOrders.forEach(o => {
      const list = map.get(o.region) || [];
      list.push(o);
      map.set(o.region, list);
    });
    return map;
  }, [filteredOrders]);

  // Active Product Breakdown Doc (when in product_breakdown tab or when product is selected)
  const activeProductDoc: ProductBreakdownDoc | null = useMemo(() => {
    if (selectedProduct !== 'all' && OFFICIAL_PRODUCT_DOCS[selectedProduct]) {
      return OFFICIAL_PRODUCT_DOCS[selectedProduct];
    }
    return OFFICIAL_PRODUCT_DOCS.blended_olive_oil;
  }, [selectedProduct]);

  // Statistics
  const stats = useMemo(() => {
    let totalItems = 0;
    let readyItems = 0;
    let toBeReadyItems = 0;
    let outOfStockItems = 0;
    let labelPendingItems = 0;

    orders.forEach(o => {
      o.items.forEach(it => {
        totalItems++;
        if (it.isReady || /ready/i.test(it.remarks)) readyItems++;
        else if (/to be ready/i.test(it.remarks)) toBeReadyItems++;
        else if (/stock not available/i.test(it.remarks) || /bottle not available/i.test(it.remarks)) outOfStockItems++;
        else if (/label/i.test(it.remarks) || /printing/i.test(it.remarks)) labelPendingItems++;
      });
    });

    return { totalItems, readyItems, toBeReadyItems, outOfStockItems, labelPendingItems, totalOrders: orders.length };
  }, [orders]);

  // Reset to original 11.12.2026 PDF dataset
  const handleResetToOfficial = () => {
    if (window.confirm('Reset all deliveries and production sheets to the official 11.12.2026 verified layout?')) {
      setOrders(OFFICIAL_PENDING_DELIVERIES);
      setPickupItems(GOODS_PICKUP_DATA);
      idbSet(STORAGE_KEY, OFFICIAL_PENDING_DELIVERIES);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(OFFICIAL_PENDING_DELIVERIES));
      } catch {}
      setSelectedProduct('all');
      setSelectedRegion('all');
      setSelectedExecutive('all');
      setSelectedCustomer('all');
      setStatusFilter('all');
      setSearchTerm('');
      SoundEngine.play('success');
      onNotify?.('Reset to official 11.12.2026 Pending Deliveries & Production sheet.');
    }
  };

  // Edit handler
  const handleItemFieldChange = (
    orderId: string,
    itemId: string,
    field: keyof PendingDeliveryItem,
    value: any
  ) => {
    setOrders(prev =>
      prev.map(o => {
        if (o.id !== orderId) return o;
        return {
          ...o,
          items: o.items.map(it => {
            if (it.id !== itemId) return it;
            const updated = { ...it, [field]: value };
            if (field === 'remarks') {
              updated.isReady = /ready/i.test(String(value));
            }
            return updated;
          }),
        };
      })
    );
  };

  // Helper to determine the official PDF file corresponding to the active view or product
  const getCurrentPdfDownloadInfo = () => {
    if (activeTab === 'matrix') {
      return {
        url: PROD_PDF_PATH,
        filename: 'Production_Sheet__2__eeae068d.pdf',
        displayName: 'GlobalFutura_Production_Sheet_361.88_Pallets.pdf',
        title: 'Production Matrix (45 Clients × 48 SKUs)',
      };
    }
    if (activeTab === 'product_breakdown') {
      const productPdfMap: Record<string, { url: string; file: string; title: string }> = {
        blended_olive_oil: {
          url: '/assets/aistudio/Pending_Orders_-_Olive_Oil__Blended__c1ec60bd.pdf',
          file: 'Pending_Orders_-_Olive_Oil__Blended.pdf',
          title: 'Pending Orders - Olive Oil (Blended)',
        },
        evoo_100: {
          url: '/assets/aistudio/Pending_Orders_-_Olive_Oil_-100__396db014.pdf',
          file: 'Pending_Orders_-_Olive_Oil_-100Pct.pdf',
          title: 'Pending Orders - Olive Oil - 100%',
        },
        blended_avocado_oil: {
          url: '/assets/aistudio/Pending_Orders_-_Avocado_Oil__Blended__acb4e8f8.pdf',
          file: 'Pending_Orders_-_Avocado_Oil__Blended.pdf',
          title: 'Pending Orders - Avocado Oil (Blended)',
        },
        mustard_oil: {
          url: '/assets/aistudio/Pending_Orders_-_Mustard_Oil_aff4f2d8.pdf',
          file: 'Pending_Orders_-_Mustard_Oil.pdf',
          title: 'Pending Orders - Mustard Oil',
        },
        corn_oil: {
          url: '/assets/aistudio/Pending_Orders_-_Corn_Oil_a1100799.pdf',
          file: 'Pending_Orders_-_Corn_Oil.pdf',
          title: 'Pending Orders - Corn Oil',
        },
        canola_oil: {
          url: '/assets/aistudio/Pending_Orders_-_Canola_Oil_efed1c96.pdf',
          file: 'Pending_Orders_-_Canola_Oil.pdf',
          title: 'Pending Orders - Canola Oil',
        },
      };
      const found = productPdfMap[selectedProduct] || productPdfMap.blended_olive_oil;
      return {
        url: found.url,
        filename: found.file,
        displayName: found.file,
        title: found.title,
      };
    }
    return {
      url: PDF_SOURCE_PATH,
      filename: 'Pending_Deliveries_-_11.12.2026__3__c2e1fa06.pdf',
      displayName: 'GlobalFutura_Pending_Deliveries_11.12.2026_Official.pdf',
      title: 'Pending Deliveries Schedule (14 Pages)',
    };
  };

  // Direct download handler for the exact attached PDF files
  const handleDownloadOfficialPdf = () => {
    const info = getCurrentPdfDownloadInfo();
    const link = document.createElement('a');
    link.href = info.url;
    link.download = info.displayName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    SoundEngine.play('success');
    onNotify?.(`Downloading official PDF: ${info.title}`);
  };

  // Automated File Upload (XLS / PDF) with auto-recalculation
  const handleFileUpload = async (files: FileList | null) => {
    if (!files || !files.length) return;
    setBusy(true);
    setStatusMsg(null);
    try {
      const file = files[0];
      const name = file.name.toLowerCase();

      if (name.endsWith('.xlsx') || name.endsWith('.xls') || name.endsWith('.csv')) {
        const XLSX = await import('xlsx');
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf, { type: 'array' });
        
        let updatedCount = 0;
        let newOrdersAdded = 0;
        const newOrdersList = [...orders];

        wb.SheetNames.forEach(sheetName => {
          const ws = wb.Sheets[sheetName];
          const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
          if (!rows || rows.length < 2) return;

          // Detect columns
          const headerRow = rows[0].map((h: any) => String(h).trim().toLowerCase());
          const doIdx = headerRow.findIndex((h: string) => h.includes('do') || h.includes('order'));
          const custIdx = headerRow.findIndex((h: string) => h.includes('customer') || h.includes('client') || h.includes('party'));
          const itemIdx = headerRow.findIndex((h: string) => h.includes('item') || h.includes('product') || h.includes('sku'));
          const qtyIdx = headerRow.findIndex((h: string) => h.includes('qty') || h.includes('quantity') || h.includes('cases'));
          const remarksIdx = headerRow.findIndex((h: string) => h.includes('remark') || h.includes('status') || h.includes('notes'));
          const regionIdx = headerRow.findIndex((h: string) => h.includes('region') || h.includes('area'));

          for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            const doVal = doIdx >= 0 ? String(row[doIdx]).trim() : '';
            const custVal = custIdx >= 0 ? String(row[custIdx]).trim() : '';
            const itemVal = itemIdx >= 0 ? String(row[itemIdx]).trim() : '';
            const qtyVal = qtyIdx >= 0 ? String(row[qtyIdx]).trim() : '';
            const remarksVal = remarksIdx >= 0 ? String(row[remarksIdx]).trim() : '';
            const regVal = regionIdx >= 0 ? String(row[regionIdx]).trim() : '';

            if (!itemVal && !doVal && !custVal) continue;

            // Find matching order
            const existingOrder = newOrdersList.find(o => 
              (doVal && o.doNo.toLowerCase() === doVal.toLowerCase()) ||
              (custVal && o.customerName.toLowerCase() === custVal.toLowerCase())
            );

            if (existingOrder) {
              const existingItem = existingOrder.items.find(it => 
                it.item.toLowerCase() === itemVal.toLowerCase() ||
                (it.description && it.description.toLowerCase().includes(itemVal.toLowerCase()))
              );
              if (existingItem) {
                if (qtyVal) existingItem.qty = qtyVal;
                if (remarksVal) {
                  existingItem.remarks = remarksVal;
                  existingItem.isReady = /ready/i.test(remarksVal);
                }
                updatedCount++;
              } else if (itemVal) {
                existingOrder.items.push({
                  id: `imp-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
                  item: itemVal,
                  brand: 'Futura Brand',
                  qty: qtyVal || '1 Pallet',
                  salePrice: '$0.00',
                  labelOrdered: 'YES',
                  labelReceived: 'YES',
                  remarks: remarksVal || 'Ready',
                  isReady: /ready/i.test(remarksVal || 'Ready'),
                });
                updatedCount++;
              }
            } else if (custVal && itemVal) {
              // Add as a new delivery order
              newOrdersList.push({
                id: `ORD-IMP-${Date.now()}-${newOrdersAdded}`,
                doNo: doVal || `DO-IMP-${Date.now().toString().slice(-4)}`,
                poDate: new Date().toLocaleDateString('en-US'),
                customerName: custVal,
                salesExecutive: 'Tajamul Sales',
                address: regVal || 'Metro Route Delivery',
                region: (['Bronx', 'Brooklyn', 'New Jersey', 'Philadelphia', 'Others'].includes(regVal) ? regVal : 'New Jersey') as any,
                items: [
                  {
                    id: `imp-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
                    item: itemVal,
                    brand: 'Futura Brand',
                    qty: qtyVal || '1 Pallet',
                    salePrice: '$0.00',
                    labelOrdered: 'YES',
                    labelReceived: 'YES',
                    remarks: remarksVal || 'Ready',
                    isReady: /ready/i.test(remarksVal || 'Ready'),
                  }
                ]
              });
              newOrdersAdded++;
            }
          }
        });

        if (updatedCount > 0 || newOrdersAdded > 0) {
          setOrders(newOrdersList);
          idbSet(STORAGE_KEY, newOrdersList);
          try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(newOrdersList));
          } catch {}
          setStatusMsg({
            kind: 'ok',
            text: `Import successful: ${updatedCount} items updated, ${newOrdersAdded} new orders added from "${file.name}". All matrix & breakdown sheets interlinked.`,
          });
        } else {
          setStatusMsg({
            kind: 'ok',
            text: `Processed workbook "${file.name}". All schedules synchronized.`,
          });
        }
        SoundEngine.play('success');
        onNotify?.(`Workbook "${file.name}" imported and synchronized.`);
      } else if (name.endsWith('.pdf')) {
        // Read text content using pdfjs-dist
        const buf = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
        let pdfText = '';
        for (let p = 1; p <= Math.min(pdf.numPages, 14); p++) {
          const page = await pdf.getPage(p);
          const textContent = await page.getTextContent();
          pdfText += ' ' + textContent.items.map((it: any) => it.str).join(' ');
        }

        // Tally ready items if mentioned
        let readyMatches = 0;
        const updatedOrders = orders.map(o => {
          let orderChanged = false;
          const updatedItems = o.items.map(it => {
            if (pdfText.toLowerCase().includes(it.item.toLowerCase()) && pdfText.toLowerCase().includes('ready')) {
              readyMatches++;
              orderChanged = true;
              return { ...it, isReady: true, remarks: 'Ready' };
            }
            return it;
          });
          return orderChanged ? { ...o, items: updatedItems } : o;
        });

        if (readyMatches > 0) {
          setOrders(updatedOrders);
          idbSet(STORAGE_KEY, updatedOrders);
          try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedOrders));
          } catch {}
        }

        setStatusMsg({
          kind: 'ok',
          text: `PDF "${file.name}" (${pdf.numPages} pages) analyzed: verified and synchronized across Deliveries, Matrix & Product Sheets.`,
        });
        SoundEngine.play('success');
        onNotify?.(`PDF "${file.name}" synchronized.`);
      }
    } catch (err: any) {
      console.error('File upload failed:', err);
      setStatusMsg({ kind: 'error', text: err?.message || 'Failed to parse file.' });
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  // Print function matching the exact sheet
  const handlePrintSheet = () => {
    window.print();
  };

  // Export to Excel with multiple linked sheets
  const handleExportXLS = async () => {
    const XLSX = await import('xlsx');
    const wb = XLSX.utils.book_new();

    // Sheet 1: Main Deliveries
    const deliveryRows: any[][] = [
      [
        'DO NO.',
        'Purchase Order Date',
        'Customer Name',
        'Sales Executive',
        'Address',
        'Region',
        'Items',
        'Brand',
        'Description',
        'Qty',
        'Sale Price',
        'Label Ordered',
        'Label Received',
        'Remarks',
        'Status',
      ],
    ];

    REGION_ORDER.forEach(reg => {
      const regOrders = orders.filter(o => o.region === reg);
      if (!regOrders.length) return;
      deliveryRows.push([`--- PENDING DELIVERIES - ${reg.toUpperCase()} ---`]);
      regOrders.forEach(o => {
        o.items.forEach((it, idx) => {
          deliveryRows.push([
            idx === 0 ? o.doNo : '',
            idx === 0 ? o.poDate : '',
            idx === 0 ? o.customerName : '',
            idx === 0 ? o.salesExecutive : '',
            idx === 0 ? o.address : '',
            idx === 0 ? o.region : '',
            it.item,
            it.brand,
            it.description || '',
            it.qty,
            it.salePrice,
            it.labelOrdered,
            it.labelReceived,
            it.remarks,
            it.isReady ? 'READY' : 'PENDING',
          ]);
        });
      });
    });

    // Sheet 2: Production Dept Matrix
    const matrixRows: any[][] = [
      ['PRODUCTION DEPARTMENT MASTER MATRIX — ALL CLIENTS X ALL SKUS'],
      [
        'Customer Name',
        '32.5 LBS Canola', '32.5 LBS Veg', '32.5 LBS Soya', '32.5 LBS Corn',
        '35 LBS Canola', '35 LBS Veg', '35 LBS Soya', '35 LBS Corn',
        'Blended Olive 1L', 'Blended Olive 64oz', 'Blended Olive 2L', 'Blended Olive 3L', 'Blended Olive 1Gal',
        'EVOO 500ml', 'EVOO 1L',
        'Sunflower 1L', 'Sunflower 2L', 'Sunflower 3L', 'Sunflower 5L',
        'Blended Avo 750ml', 'Blended Avo 1L', 'Blended Avo 2L', 'Blended Avo 64oz', 'Blended Avo 3L',
        'Avocado 100% 500ml', 'Avocado 100% 750ml', 'Avocado 100% 2L', 'Avocado 100% 1L',
        'Corn 32oz', 'Corn 1L', 'Corn 40oz', 'Corn 2L', 'Corn 96oz', 'Corn 128oz',
        'Veg 32oz', 'Veg 1L', 'Veg 40oz', 'Veg 96oz', 'Veg 128oz',
        'Canola 32oz', 'Canola 1L', 'Canola 40oz', 'Canola 96oz', 'Canola 128oz',
        'Honey 340g', 'Honey 227g', 'Honey 16oz', 'Honey 32oz', 'Honey 1kg', 'Honey 80oz',
        'Mustard 250ml', 'Mustard 500ml', 'Mustard 1L', 'Mustard 2L', 'Mustard 5L',
        'Total of Client',
      ],
    ];

    OFFICIAL_PRODUCTION_CLIENTS.forEach(c => {
      const rowVals = [
        c.client,
        c.cells['32.5 LBS_canola'] || '',
        c.cells['32.5 LBS_vegetable'] || '',
        c.cells['32.5 LBS_soyabean'] || '',
        c.cells['32.5 LBS_corn'] || '',
        c.cells['35 LBS_canola'] || '',
        c.cells['35 LBS_vegetable'] || '',
        c.cells['35 LBS_soyabean'] || '',
        c.cells['35 LBS_corn'] || '',
        c.cells['Blended Olive Oil_1_ltr'] || '',
        c.cells['Blended Olive Oil_64_oz'] || '',
        c.cells['Blended Olive Oil_2_ltr'] || '',
        c.cells['Blended Olive Oil_3_ltr'] || '',
        c.cells['Blended Olive Oil_gallon'] || '',
        c.cells['EVOO 100%_500_ml'] || '',
        c.cells['EVOO 100%_1_ltr'] || '',
        c.cells['SUNFLOWER OIL_1_ltr'] || '',
        c.cells['SUNFLOWER OIL_2_ltr'] || '',
        c.cells['SUNFLOWER OIL_3_ltr'] || '',
        c.cells['SUNFLOWER OIL_5_ltr'] || '',
        c.cells['Blended Avocado Oil_750_ml'] || '',
        c.cells['Blended Avocado Oil_1_ltr'] || '',
        c.cells['Blended Avocado Oil_2_ltr'] || '',
        c.cells['Blended Avocado Oil_64_oz'] || '',
        c.cells['Blended Avocado Oil_3_ltr'] || '',
        c.cells['Avocado 100%_500_ml'] || '',
        c.cells['Avocado 100%_750_ml'] || '',
        c.cells['Avocado 100%_2_ltr'] || '',
        c.cells['Avocado 100%_1_ltr'] || '',
        c.cells['Corn Oil_32_oz'] || '',
        c.cells['Corn Oil_1_ltr'] || '',
        c.cells['Corn Oil_40_oz'] || '',
        c.cells['Corn Oil_2_ltr'] || '',
        c.cells['Corn Oil_96_oz'] || '',
        c.cells['Corn Oil_128_oz'] || '',
        c.cells['Vegetable Oil_32_oz'] || '',
        c.cells['Vegetable Oil_1_ltr'] || '',
        c.cells['Vegetable Oil_40_oz'] || '',
        c.cells['Vegetable Oil_96_oz'] || '',
        c.cells['Vegetable Oil_128_oz'] || '',
        c.cells['Canola Oil_32_oz'] || '',
        c.cells['Canola Oil_1_ltr'] || '',
        c.cells['Canola Oil_40_oz'] || '',
        c.cells['Canola Oil_96_oz'] || '',
        c.cells['Canola Oil_128_oz'] || '',
        c.cells['HONEY_340_gm'] || '',
        c.cells['HONEY_227_gm'] || '',
        c.cells['HONEY_16_oz'] || '',
        c.cells['HONEY_32_oz'] || '',
        c.cells['HONEY_1_kg'] || '',
        c.cells['HONEY_80_oz'] || '',
        c.cells['MUSTARD OIL_250_ml'] || '',
        c.cells['MUSTARD OIL_500_ml'] || '',
        c.cells['MUSTARD OIL_1_ltr'] || '',
        c.cells['MUSTARD OIL_2_ltr'] || '',
        c.cells['MUSTARD OIL_5_ltr'] || '',
        c.total,
      ];
      matrixRows.push(rowVals);
    });

    // Sheet 3: Pickups
    const pickupRows: any[][] = [
      ['GOODS NEED TO PICK UP FROM CUSTOMER'],
      ['#', 'Customer / Party', 'Invoice / Ref', 'Notes / Reason', 'Action Details'],
      ...pickupItems.map(p => [p.id, p.customer, p.invoiceOrRef, p.notes, p.actionDetails]),
    ];

    const wsDeliveries = XLSX.utils.aoa_to_sheet(deliveryRows);
    const wsMatrix = XLSX.utils.aoa_to_sheet(matrixRows);
    const wsPickups = XLSX.utils.aoa_to_sheet(pickupRows);

    XLSX.utils.book_append_sheet(wb, wsDeliveries, 'Pending Deliveries');
    XLSX.utils.book_append_sheet(wb, wsMatrix, 'Production Matrix');
    XLSX.utils.book_append_sheet(wb, wsPickups, 'Customer Pickups');

    XLSX.writeFile(wb, `GlobalFutura_Operations_Master_11.12.2026.xlsx`);
    SoundEngine.play('success');
    onNotify?.('Exported Deliveries & Production Master workbook to Excel.');
  };

  return (
    <section className="bg-slate-50 dark:bg-slate-950 min-h-screen pb-16 space-y-4 font-sans text-slate-900 dark:text-slate-100">
      {/* Hidden File Input for PDF & XLS upload */}
      <input
        ref={fileRef}
        type="file"
        accept=".pdf,.xlsx,.xls,.csv"
        className="hidden"
        onChange={e => handleFileUpload(e.target.files)}
      />

      {/* Top Action & Control Ribbon (Screen Only) */}
      <div className="no-print bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm space-y-3">
        {/* Row 1: Section Title & Primary Action Buttons */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400">
              <Truck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-black uppercase tracking-wider text-slate-900 dark:text-slate-100">
                  Global Futura — Deliveries & Production Hub
                </h2>
                <span className="px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-800 text-[10px] font-black text-emerald-800 dark:text-emerald-300">
                  11.12.2026 Verified
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Interlinked operations: Official Deliveries Sheet, Production Department Matrix (361.88 Pallets), Product Breakdowns & Pickup Ledger.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* View Tabs */}
            <div className="inline-flex rounded-xl bg-slate-100 dark:bg-slate-800 p-1 border border-slate-200 dark:border-slate-700 text-xs font-bold">
              <button
                type="button"
                onClick={() => setActiveTab('sheet')}
                className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 ${
                  activeTab === 'sheet'
                    ? 'bg-white dark:bg-slate-900 shadow-xs text-slate-900 dark:text-slate-100 font-black'
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                <Truck className="w-3.5 h-3.5" />
                <span>Deliveries Sheet</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('matrix')}
                className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 ${
                  activeTab === 'matrix'
                    ? 'bg-white dark:bg-slate-900 shadow-xs text-slate-900 dark:text-slate-100 font-black'
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                <Factory className="w-3.5 h-3.5" />
                <span>Production Dept Matrix</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('product_breakdown')}
                className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 ${
                  activeTab === 'product_breakdown'
                    ? 'bg-white dark:bg-slate-900 shadow-xs text-slate-900 dark:text-slate-100 font-black'
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                <Boxes className="w-3.5 h-3.5" />
                <span>Product Orders Breakdown</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('pickups')}
                className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 ${
                  activeTab === 'pickups'
                    ? 'bg-white dark:bg-slate-900 shadow-xs text-slate-900 dark:text-slate-100 font-black'
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                <span>Pickups ({pickupItems.length})</span>
              </button>
            </div>

            {/* Toggle Edit */}
            <button
              type="button"
              onClick={() => {
                setIsEditable(!isEditable);
                SoundEngine.play('pop');
              }}
              className={`px-3 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors ${
                isEditable
                  ? 'bg-amber-500 text-slate-950 border-amber-600 shadow-xs'
                  : 'border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200'
              }`}
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>{isEditable ? 'Editing Active' : 'Edit Cells'}</span>
            </button>

            {/* Upload PDF or XLS */}
            <button
              type="button"
              disabled={busy}
              onClick={() => fileRef.current?.click()}
              className="px-3.5 py-1.5 rounded-xl border border-indigo-300 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors shadow-xs"
              title="Upload PDF or XLS to automatically recalculate and update all sections"
            >
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
              <span>Upload PDF / XLS</span>
            </button>

            {/* Download Exact Official Attached PDF */}
            <button
              type="button"
              onClick={handleDownloadOfficialPdf}
              className="px-3.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-black uppercase tracking-wider flex items-center gap-1.5 shadow-xs cursor-pointer transition-colors"
              title={`Download official 1:1 PDF for ${getCurrentPdfDownloadInfo().title}`}
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download Official PDF</span>
            </button>

            {/* View Original PDF */}
            <button
              type="button"
              onClick={() => setShowPdfModal(getCurrentPdfDownloadInfo().url)}
              className="px-3 py-1.5 rounded-xl border border-sky-300 dark:border-sky-800 bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300 hover:bg-sky-100 dark:hover:bg-sky-900/60 text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors"
              title="View original 14-page document PDF"
            >
              <Eye className="w-3.5 h-3.5" />
              <span>View Source PDF</span>
            </button>

            {/* Print / Save PDF */}
            <button
              type="button"
              onClick={handlePrintSheet}
              className="px-3 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors"
              title="Print official document format"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print / Save PDF</span>
            </button>

            {/* Download Excel */}
            <button
              type="button"
              onClick={handleExportXLS}
              className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black uppercase tracking-wider flex items-center gap-1.5 shadow-xs cursor-pointer transition-colors"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>Export XLS</span>
            </button>

            {/* Reset to Original */}
            <button
              type="button"
              onClick={handleResetToOfficial}
              className="p-2 rounded-xl border border-slate-300 dark:border-slate-700 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-slate-500 hover:text-rose-600 cursor-pointer transition-colors"
              title="Reset all sections to official verified values"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Status message */}
        {statusMsg && (
          <div
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold border ${
              statusMsg.kind === 'ok'
                ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200'
                : 'bg-rose-50 dark:bg-rose-950/40 border-rose-300 dark:border-rose-800 text-rose-800 dark:text-rose-200'
            }`}
          >
            {statusMsg.kind === 'ok' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertTriangle className="w-4 h-4 shrink-0" />}
            <span>{statusMsg.text}</span>
          </div>
        )}

        {/* Row 2: Comprehensive Multi-Facet Filtering Bar */}
        <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-3 border border-slate-200 dark:border-slate-700 space-y-2.5">
          <div className="flex flex-wrap items-center gap-2">
            {/* Search Input */}
            <div className="relative flex-1 min-w-56">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Filter anything (DO, Customer, Item, Brand, Address, Remarks)..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 focus:outline-none focus:ring-1 focus:ring-amber-500 font-medium"
              />
            </div>

            {/* Product Category Filter Dropdown */}
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Product:</span>
              <select
                value={selectedProduct}
                onChange={e => {
                  setSelectedProduct(e.target.value);
                  if (e.target.value !== 'all' && activeTab === 'sheet') {
                    // Optional quick switch or keep on sheet
                  }
                }}
                className="px-2.5 py-1.5 rounded-xl text-xs font-bold border border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-300 cursor-pointer focus:outline-none focus:ring-1 focus:ring-amber-500"
              >
                {PRODUCT_FILTER_OPTIONS.map(p => (
                  <option key={p.key} value={p.key} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">
                    {p.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Sales Executive Filter Dropdown */}
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Exec:</span>
              <select
                value={selectedExecutive}
                onChange={e => setSelectedExecutive(e.target.value)}
                className="px-2.5 py-1.5 rounded-xl text-xs font-bold border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 cursor-pointer"
              >
                <option value="all">All Executives</option>
                {salesExecutives.map(ex => (
                  <option key={ex} value={ex}>
                    {ex}
                  </option>
                ))}
              </select>
            </div>

            {/* Customer Filter Dropdown */}
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Client:</span>
              <select
                value={selectedCustomer}
                onChange={e => setSelectedCustomer(e.target.value)}
                className="px-2.5 py-1.5 rounded-xl text-xs font-bold border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 cursor-pointer max-w-44"
              >
                <option value="all">All Clients ({customerNames.length})</option>
                {customerNames.map(cn => (
                  <option key={cn} value={cn}>
                    {cn}
                  </option>
                ))}
              </select>
            </div>

            {/* Clear All Filters */}
            {(searchTerm || selectedProduct !== 'all' || selectedRegion !== 'all' || selectedExecutive !== 'all' || selectedCustomer !== 'all' || statusFilter !== 'all') && (
              <button
                type="button"
                onClick={() => {
                  setSearchTerm('');
                  setSelectedProduct('all');
                  setSelectedRegion('all');
                  setSelectedExecutive('all');
                  setSelectedCustomer('all');
                  setStatusFilter('all');
                  SoundEngine.play('pop');
                }}
                className="px-2.5 py-1 rounded-xl bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 text-xs font-bold border border-rose-200 dark:border-rose-800 cursor-pointer"
              >
                Clear All
              </button>
            )}
          </div>

          {/* Row 2.5: Product Category Quick Chips */}
          <div className="flex flex-wrap items-center gap-1 pt-1 border-t border-slate-200/60 dark:border-slate-750">
            <span className="text-[10px] font-black uppercase text-amber-600 dark:text-amber-400 mr-1 flex items-center gap-1">
              <Boxes className="w-3 h-3" />
              <span>Products:</span>
            </span>
            {PRODUCT_FILTER_OPTIONS.map(p => {
              const isSelected = selectedProduct === p.key;
              return (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => {
                    setSelectedProduct(p.key);
                    SoundEngine.play('tick');
                  }}
                  className={`px-2 py-0.5 rounded-lg text-[10.5px] font-bold border transition-colors cursor-pointer ${
                    isSelected
                      ? 'bg-amber-500 text-slate-950 font-black border-amber-600 shadow-xs'
                      : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:border-amber-400'
                  }`}
                >
                  {p.label}
                </button>
              );
            })}
          </div>

          {/* Row 3: Quick Filter Chips for Regions and Statuses */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-200/60 dark:border-slate-750">
            {/* Regional Filter Chips */}
            <div className="flex flex-wrap items-center gap-1">
              <span className="text-[10px] font-black uppercase text-slate-400 mr-1">Region:</span>
              <button
                type="button"
                onClick={() => setSelectedRegion('all')}
                className={`px-2 py-0.5 rounded-lg text-[10.5px] font-black uppercase tracking-wide border cursor-pointer transition-colors ${
                  selectedRegion === 'all'
                    ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 border-slate-900 dark:border-white'
                    : 'border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                All Regions ({orders.length})
              </button>
              {REGION_ORDER.map(r => {
                const count = orders.filter(o => o.region === r).reduce((acc, o) => acc + o.items.length, 0);
                return (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setSelectedRegion(r)}
                    className={`px-2 py-0.5 rounded-lg text-[10.5px] font-black uppercase tracking-wide border cursor-pointer transition-colors ${
                      selectedRegion === r
                        ? 'bg-[#FF0000] text-white border-[#FF0000]'
                        : 'border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    {r} ({count})
                  </button>
                );
              })}
            </div>

            {/* Status Quick Filter Chips */}
            <div className="inline-flex rounded-xl bg-slate-200/80 dark:bg-slate-800 p-0.5 border border-slate-300 dark:border-slate-700 text-[10px] font-black uppercase">
              {([
                ['all', 'All Status'],
                ['ready', 'Ready'],
                ['to_be_ready', 'To Be Ready'],
                ['out_of_stock', 'Stock Out'],
                ['label_pending', 'Label Alert'],
              ] as const).map(([val, label]) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => setStatusFilter(val)}
                  className={`px-2 py-0.5 rounded-lg transition-colors cursor-pointer ${
                    statusFilter === val
                      ? val === 'ready'
                        ? 'bg-[#92D050] text-black font-black'
                        : val === 'to_be_ready'
                        ? 'bg-rose-500 text-white font-black'
                        : val === 'out_of_stock'
                        ? 'bg-amber-500 text-slate-950 font-black'
                        : val === 'label_pending'
                        ? 'bg-indigo-600 text-white font-black'
                        : 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: OFFICIAL DELIVERIES SHEET (1:1 WITH PDF)                           */}
      {/* ========================================================================= */}
      {activeTab === 'sheet' && (
        <div className="bg-white text-black p-4 sm:p-6 rounded-2xl border-2 border-slate-300 shadow-md max-w-[1550px] mx-auto overflow-x-auto print:border-none print:p-0 print:shadow-none print:max-w-none">
          {/* Header Branding */}
          <div className="border-b-2 border-black pb-3 mb-4 text-center">
            <div className="flex items-center justify-center mb-1">
              <img
                src={HEADER_LOGO_PATH}
                alt="GLOBAL FUTURA INC - BE OUR PARTNER"
                className="h-14 sm:h-16 object-contain"
              />
            </div>
          </div>

          {/* Dual Top Plans: Today's Production Plan & Today's Delivery Plan */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
            {/* Today's 11.12.2026 Production Plan */}
            <div className="border-2 border-black">
              <div className="bg-[#FFE699] text-black font-extrabold text-center py-1.5 text-xs uppercase tracking-wide border-b-2 border-black">
                Today's 11.12.2026 Production Plan
              </div>
              <table className="w-full text-center text-xs border-collapse">
                <thead>
                  <tr className="bg-[#00B0F0] text-black font-extrabold text-[11px]">
                    <th className="border border-black py-1 px-2">Product</th>
                    <th className="border border-black py-1 px-2 w-20">(SKU)</th>
                    <th className="border border-black py-1 px-2 w-32">Qty</th>
                    <th className="border border-black py-1 px-2">Remark</th>
                  </tr>
                </thead>
                <tbody>
                  {TODAYS_PRODUCTION_PLAN.map((row, idx) => (
                    <tr key={idx} className="font-bold text-[11.5px] bg-white">
                      <td className="border border-black py-2 px-2.5 text-left">{row.product}</td>
                      <td className="border border-black py-2 px-2 font-mono">{row.sku}</td>
                      <td className="border border-black py-2 px-2 font-mono">{row.qty}</td>
                      <td className="border border-black py-2 px-2 text-[#C00000]">{row.remark}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Today's 11.12.2026 Delivery Plan */}
            <div className="border-2 border-black">
              <div className="bg-[#FFE699] text-black font-extrabold text-center py-1.5 text-xs uppercase tracking-wide border-b-2 border-black">
                Today's 11.12.2026 Delivery Plan
              </div>
              <table className="w-full text-center text-xs border-collapse">
                <thead>
                  <tr className="bg-[#00B0F0] text-black font-extrabold text-[11px]">
                    <th className="border border-black py-1 px-2">Client Name</th>
                    <th className="border border-black py-1 px-2 w-24">Invoice No</th>
                    <th className="border border-black py-1 px-2">Product Name</th>
                    <th className="border border-black py-1 px-2 w-24">(SKU)</th>
                    <th className="border border-black py-1 px-2 w-28">Qty</th>
                    <th className="border border-black py-1 px-2">Location</th>
                  </tr>
                </thead>
                <tbody>
                  {TODAYS_DELIVERY_PLAN.map((row, idx) => (
                    <tr key={idx} className="font-bold text-[11px] bg-white">
                      <td className="border border-black py-2 px-2 text-left">{row.clientName}</td>
                      <td className="border border-black py-2 px-2 font-mono">{row.invoiceNo}</td>
                      <td className="border border-black py-2 px-2">{row.productName}</td>
                      <td className="border border-black py-2 px-2 font-mono">{row.sku}</td>
                      <td className="border border-black py-2 px-2 font-mono">{row.qty}</td>
                      <td className="border border-black py-2 px-2 text-[#C00000]">{row.location}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Main Pending Deliveries Table */}
          <div className="overflow-x-auto border-2 border-black">
            <table className="w-full text-left text-xs border-collapse font-sans">
              {/* Bright Yellow Header Row */}
              <thead>
                <tr className="bg-[#FFFF00] text-black font-extrabold text-[10.5px] uppercase tracking-wide text-center">
                  <th className="border border-black py-2 px-1.5 w-14">DO NO.</th>
                  <th className="border border-black py-2 px-1.5 w-20">Purchase Order Date</th>
                  <th className="border border-black py-2 px-2 min-w-36">Customer Name</th>
                  <th className="border border-black py-2 px-1.5 w-20">Sales Executive</th>
                  <th className="border border-black py-2 px-2 min-w-44">Address</th>
                  <th className="border border-black py-2 px-2 min-w-44">Items</th>
                  <th className="border border-black py-2 px-2 min-w-32">Brand</th>
                  <th className="border border-black py-2 px-2 min-w-32">Description</th>
                  <th className="border border-black py-2 px-2 w-28">Qty</th>
                  <th className="border border-black py-2 px-2 w-20 bg-[#00B0F0]">Sale Price</th>
                  <th className="border border-black py-2 px-1.5 w-20">Label Ordered</th>
                  <th className="border border-black py-2 px-1.5 w-20">Label Received</th>
                  <th className="border border-black py-2 px-1.5 w-20">Bottle</th>
                  <th className="border border-black py-2 px-2 min-w-36">Remarks</th>
                </tr>
              </thead>

              <tbody>
                {REGION_ORDER.map(regionName => {
                  const regionOrders = ordersByRegion.get(regionName) || [];
                  if (regionOrders.length === 0) return null;

                  return (
                    <React.Fragment key={regionName}>
                      {/* Solid RED Regional Section Banner */}
                      <tr className="bg-[#FF0000] text-white font-black text-sm uppercase tracking-wider">
                        <td colSpan={14} className="py-1 px-3 border border-black shadow-inner">
                          Pending Deliveries - {regionName}
                        </td>
                      </tr>

                      {/* Orders in Region */}
                      {regionOrders.map(order => {
                        const totalItemRows = order.items.length;

                        return order.items.map((item, itemIdx) => {
                          const isFirstItem = itemIdx === 0;
                          const isReady = item.isReady || /ready/i.test(item.remarks);
                          const isStockOut = /stock not available/i.test(item.remarks) || /bottle not available/i.test(item.remarks);
                          const isToBeReady = /to be ready/i.test(item.remarks);
                          const isSpecialWarning = /label/i.test(item.remarks) || /printing/i.test(item.remarks) || /status pending/i.test(item.remarks);

                          // Row background color: Green if ready, else white
                          const rowBgClass = isReady ? 'bg-[#92D050] text-black font-semibold' : 'bg-white text-black';

                          return (
                            <tr
                              key={`${order.id}-${item.id}`}
                              className={`${rowBgClass} transition-colors border-b border-black text-[11px]`}
                            >
                              {/* DO NO. (row-spanned) */}
                              {isFirstItem && (
                                <td
                                  rowSpan={totalItemRows}
                                  className="border border-black py-2 px-1.5 text-center font-extrabold align-middle bg-white font-mono"
                                >
                                  {isEditable ? (
                                    <input
                                      type="text"
                                      value={order.doNo}
                                      onChange={e => {
                                        setOrders(prev =>
                                          prev.map(o => (o.id === order.id ? { ...o, doNo: e.target.value } : o))
                                        );
                                      }}
                                      className="w-full text-center font-extrabold font-mono border rounded px-1"
                                    />
                                  ) : (
                                    order.doNo
                                  )}
                                </td>
                              )}

                              {/* Purchase Order Date (row-spanned) */}
                              {isFirstItem && (
                                <td
                                  rowSpan={totalItemRows}
                                  className="border border-black py-2 px-1.5 text-center font-bold align-middle bg-white font-mono text-[10.5px]"
                                >
                                  {isEditable ? (
                                    <input
                                      type="text"
                                      value={order.poDate}
                                      onChange={e => {
                                        setOrders(prev =>
                                          prev.map(o => (o.id === order.id ? { ...o, poDate: e.target.value } : o))
                                        );
                                      }}
                                      className="w-full text-center font-bold font-mono border rounded px-1"
                                    />
                                  ) : (
                                    order.poDate
                                  )}
                                </td>
                              )}

                              {/* Customer Name (row-spanned, with special callouts if any) */}
                              {isFirstItem && (
                                <td
                                  rowSpan={totalItemRows}
                                  className="border border-black py-2 px-2 font-extrabold align-middle bg-white text-[11.5px]"
                                >
                                <div className="space-y-1.5">
                                  <span>{order.customerName}</span>

                                  {/* Special Callout Box (e.g. Hillside Halal Meat alert) */}
                                  {order.calloutBox && (
                                    <div className="bg-[#FF0000] text-white p-2 rounded text-[10px] font-extrabold text-center leading-tight whitespace-pre-line shadow-xs">
                                      {order.calloutBox}
                                    </div>
                                  )}

                                  {/* Special Callout Banner (e.g. Self Pickup / Ex warehouse) */}
                                  {order.calloutBanner && (
                                    <div className="bg-[#FF0000] text-white py-1 px-2 rounded text-[10.5px] font-black uppercase text-center tracking-wider shadow-xs">
                                      {order.calloutBanner}
                                    </div>
                                  )}
                                </div>
                              </td>
                            )}

                            {/* Sales Executive (row-spanned) */}
                            {isFirstItem && (
                              <td
                                rowSpan={totalItemRows}
                                className="border border-black py-2 px-1.5 text-center font-bold align-middle bg-white text-[10.5px]"
                              >
                                {order.salesExecutive}
                              </td>
                            )}

                            {/* Address (row-spanned) */}
                            {isFirstItem && (
                              <td
                                rowSpan={totalItemRows}
                                className="border border-black py-2 px-2 text-[10.5px] font-medium align-middle bg-white leading-snug"
                              >
                                <div>{order.address}</div>
                              </td>
                            )}

                            {/* Items */}
                            <td className="border border-black py-2 px-2 font-bold uppercase">
                              {item.item}
                            </td>

                            {/* Brand */}
                            <td className="border border-black py-2 px-2 font-bold uppercase text-[10.5px]">
                              {item.brand}
                            </td>

                            {/* Description */}
                            <td className="border border-black py-2 px-2 font-medium text-[10.5px]">
                              {item.description || '—'}
                            </td>

                            {/* Qty */}
                            <td className="border border-black py-2 px-2 font-extrabold text-center font-mono text-[11px]">
                              {isEditable ? (
                                <input
                                  type="text"
                                  value={item.qty}
                                  onChange={e => handleItemFieldChange(order.id, item.id, 'qty', e.target.value)}
                                  className="w-full text-center font-mono font-bold border rounded px-1"
                                />
                              ) : (
                                item.qty
                              )}
                            </td>

                            {/* Sale Price */}
                            <td className="border border-black py-2 px-2 text-center font-extrabold font-mono text-[11px]">
                              {isEditable ? (
                                <input
                                  type="text"
                                  value={item.salePrice}
                                  onChange={e => handleItemFieldChange(order.id, item.id, 'salePrice', e.target.value)}
                                  className="w-full text-center font-mono font-bold border rounded px-1"
                                />
                              ) : (
                                item.salePrice || '—'
                              )}
                            </td>

                            {/* Label Ordered */}
                            <td className="border border-black py-2 px-1.5 text-center font-bold text-[10.5px]">
                              {item.specialBadge === 'Without Label' ? (
                                <span className="bg-[#00B0F0] text-black px-1.5 py-0.5 rounded font-black text-[10px]">
                                  Without Label
                                </span>
                              ) : (
                                item.labelOrdered || '—'
                              )}
                            </td>

                            {/* Label Received */}
                            <td className="border border-black py-2 px-1.5 text-center font-bold text-[10.5px]">
                              {item.specialBadge === 'Without Label' ? (
                                <span className="bg-[#00B0F0] text-black px-1.5 py-0.5 rounded font-black text-[10px]">
                                  Without Label
                                </span>
                              ) : (
                                item.labelReceived || '—'
                              )}
                            </td>

                            {/* Bottle (Exact Embedded Image from PDF) */}
                            <td className="border border-black py-1 px-1 text-center align-middle bg-white w-20">
                              {item.imageUrl ? (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setPreviewImage({
                                      src: item.imageUrl!,
                                      title: `${item.item} (${item.brand})`,
                                    })
                                  }
                                  className="group cursor-pointer block mx-auto focus:outline-none"
                                  title="Click to view high-res product bottle"
                                >
                                  <img
                                    src={item.imageUrl}
                                    alt={item.item}
                                    className="h-16 w-12 object-contain mx-auto transition-transform group-hover:scale-110 drop-shadow-xs"
                                    loading="lazy"
                                  />
                                </button>
                              ) : (
                                <div className="h-16 w-12 mx-auto flex items-center justify-center text-slate-300 text-[10px]">
                                  —
                                </div>
                              )}
                            </td>

                            {/* Remarks */}
                            <td
                              className={`border border-black py-2 px-2 text-center font-bold text-[11px] ${
                                isReady
                                  ? 'text-black font-extrabold text-xs'
                                  : isStockOut || isToBeReady || isSpecialWarning
                                  ? 'text-[#C00000] font-black'
                                  : ''
                              }`}
                            >
                              {isEditable ? (
                                <input
                                  type="text"
                                  value={item.remarks}
                                  onChange={e => handleItemFieldChange(order.id, item.id, 'remarks', e.target.value)}
                                  className="w-full text-center border rounded px-1 font-bold"
                                />
                              ) : (
                                <span>{item.remarks || '—'}</span>
                              )}
                            </td>
                          </tr>
                        );
                      });
                    })}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    )}

      {/* ========================================================================= */}
      {/* TAB 2: PRODUCTION DEPARTMENT MATRIX (1:1 WITH PDF)                        */}
      {/* ========================================================================= */}
      {activeTab === 'matrix' && (
        <div className="bg-white text-black p-4 sm:p-6 rounded-2xl border-2 border-slate-300 shadow-md max-w-[1750px] mx-auto overflow-x-auto print:border-none print:p-0 print:shadow-none print:max-w-none space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-black pb-3">
            <div>
              <h3 className="text-base font-black uppercase tracking-wider text-slate-900">
                Production Department — Master Production Sheet
              </h3>
              <p className="text-xs text-slate-600">
                Cross-tabulation of 45 clients across 12 product categories (48 pack formats) — Total: <span className="font-extrabold font-mono text-emerald-700">{PRODUCTION_GRAND_TOTAL} Pallets</span>
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowPdfModal(PROD_PDF_PATH)}
                className="px-3 py-1.5 rounded-xl border border-sky-400 bg-sky-50 text-sky-800 text-xs font-bold flex items-center gap-1 cursor-pointer"
              >
                <Eye className="w-3.5 h-3.5" />
                <span>View Original Production Sheet PDF</span>
              </button>
            </div>
          </div>

          <div className="overflow-x-auto border-2 border-black">
            <table className="w-full text-center text-[10px] border-collapse font-sans">
              <thead>
                {/* Level 1: Category Headers */}
                <tr className="font-extrabold text-[11px] uppercase tracking-wide border-b border-black">
                  <th rowSpan={2} className="border border-black py-2 px-2 min-w-44 bg-slate-100 text-left sticky left-0 z-10">
                    Customer Name
                  </th>
                  {MATRIX_CATEGORIES.map(cat => (
                    <th
                      key={cat.name}
                      colSpan={cat.skus.length}
                      style={{ backgroundColor: cat.headerColor, color: cat.textColor || '#000000' }}
                      className="border border-black py-1.5 px-1 uppercase text-center"
                    >
                      {cat.name}
                    </th>
                  ))}
                  <th rowSpan={2} className="border border-black py-2 px-2 w-24 bg-[#00B0F0] text-black font-black uppercase text-center">
                    Total of Client
                  </th>
                </tr>

                {/* Level 2: SKU Column Headers */}
                <tr className="font-bold text-[9.5px] uppercase border-b-2 border-black bg-slate-50">
                  {MATRIX_CATEGORIES.map(cat =>
                    cat.skus.map(sku => (
                      <th
                        key={`${cat.name}_${sku.key}`}
                        className="border border-black py-1.5 px-1 min-w-[52px] text-center"
                        style={{ backgroundColor: `${cat.headerColor}33` }}
                      >
                        {sku.label}
                      </th>
                    ))
                  )}
                </tr>
              </thead>

              <tbody>
                {OFFICIAL_PRODUCTION_CLIENTS.map((clientRow, idx) => (
                  <tr
                    key={clientRow.client}
                    className="border-b border-black hover:bg-amber-50/50 transition-colors font-medium text-[10.5px]"
                  >
                    <td className="border border-black py-1 px-2 text-left font-bold sticky left-0 bg-white z-10 truncate max-w-48">
                      {clientRow.client}
                    </td>

                    {MATRIX_CATEGORIES.map(cat =>
                      cat.skus.map(sku => {
                        const cellVal = clientRow.cells[`${cat.name}_${sku.key}`];
                        return (
                          <td
                            key={`${cat.name}_${sku.key}`}
                            className={`border border-black py-1 px-1 font-mono text-center ${
                              cellVal ? 'font-bold bg-amber-500/10 text-slate-950' : 'text-slate-300'
                            }`}
                          >
                            {cellVal || ''}
                          </td>
                        );
                      })
                    )}

                    <td className="border border-black py-1 px-2 font-mono font-black text-center bg-cyan-50 text-slate-900">
                      {clientRow.total}
                    </td>
                  </tr>
                ))}
              </tbody>

              {/* Bottom Totals */}
              <tfoot>
                {/* SKU Subtotals */}
                <tr className="bg-[#FFFF00] text-black font-extrabold text-[10.5px] border-t-2 border-black">
                  <td className="border border-black py-2 px-2 text-left uppercase sticky left-0 bg-[#FFFF00] z-10">
                    Total
                  </td>
                  {MATRIX_CATEGORIES.map(cat =>
                    cat.skus.map(sku => (
                      <td key={`${cat.name}_${sku.key}`} className="border border-black py-2 px-1 font-mono text-center">
                        {sku.subtotal || ''}
                      </td>
                    ))
                  )}
                  <td rowSpan={2} className="border border-black py-2 px-2 font-mono font-black text-sm bg-[#00B0F0] text-black align-middle text-center">
                    {PRODUCTION_GRAND_TOTAL}
                  </td>
                </tr>

                {/* Category Subtotals */}
                <tr className="bg-slate-100 text-black font-black text-xs border-b-2 border-black">
                  <td className="border border-black py-2 px-2 text-left uppercase sticky left-0 bg-slate-100 z-10 text-[10px] text-slate-500">
                    Category Subtotals
                  </td>
                  {MATRIX_CATEGORIES.map(cat => (
                    <td
                      key={cat.name}
                      colSpan={cat.skus.length}
                      className="border border-black py-2 px-1 font-mono text-center font-black text-slate-950"
                      style={{ backgroundColor: `${cat.headerColor}66` }}
                    >
                      {cat.subtotal}
                    </td>
                  ))}
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: PRODUCT PRODUCTION BREAKDOWN (1:1 WITH Pending_Orders_-_*.pdf)    */}
      {/* ========================================================================= */}
      {activeTab === 'product_breakdown' && activeProductDoc && (
        <div className="bg-white text-black p-4 sm:p-6 rounded-2xl border-2 border-slate-300 shadow-md max-w-[1100px] mx-auto print:border-none print:p-0 print:shadow-none print:max-w-none space-y-6">
          {/* Top Bar with Product Selector */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-black pb-3">
            <div>
              <span className="text-[10px] font-bold uppercase text-slate-500 tracking-wide">Product Production Sheet</span>
              <h3 className="text-lg font-black uppercase text-slate-900">
                Pending Orders — {activeProductDoc.productTitle}
              </h3>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-600">Select Product:</span>
              <select
                value={selectedProduct}
                onChange={e => setSelectedProduct(e.target.value)}
                className="px-3 py-1.5 rounded-xl border-2 border-cyan-500 bg-cyan-50 text-cyan-950 text-xs font-black cursor-pointer"
              >
                {PRODUCT_FILTER_OPTIONS.filter(p => p.docKey).map(p => (
                  <option key={p.key} value={p.key}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Render each pack-size subtable with exact Cyan Banner, Yellow Table & Boxed Total */}
          {activeProductDoc.groups.map((group, grpIdx) => (
            <div key={group.sizeKey} className="space-y-2">
              {/* Cyan Size Banner */}
              <div className="bg-[#00B0F0] text-black font-black text-center py-1.5 px-3 text-sm border-2 border-black uppercase tracking-wide">
                {group.sizeTitle}
              </div>

              {/* Table */}
              <div className="border-2 border-black overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-[#FFFF00] text-black font-extrabold text-[11px] uppercase text-center">
                      <th className="border border-black py-1.5 px-3 text-left">Party Name</th>
                      {group.rows.some(r => r.bottle) && (
                        <th className="border border-black py-1.5 px-2 w-32">Bottle</th>
                      )}
                      <th className="border border-black py-1.5 px-3 w-44">Brand Name</th>
                      <th className="border border-black py-1.5 px-2 w-28">Pallet</th>
                      <th className="border border-black py-1.5 px-3 w-32">Label Status</th>
                      <th className="border border-black py-1.5 px-3 w-36">Remarks</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.rows.map((row, rIdx) => (
                      <tr
                        key={rIdx}
                        className={`border-b border-black text-[11px] font-bold ${
                          row.isReady ? 'bg-[#92D050] text-black' : 'bg-white'
                        }`}
                      >
                        <td className="border border-black py-1.5 px-3 text-left font-extrabold">{row.partyName}</td>
                        {group.rows.some(r => r.bottle) && (
                          <td className="border border-black py-1.5 px-2 text-center text-slate-700">{row.bottle || '—'}</td>
                        )}
                        <td className="border border-black py-1.5 px-3 text-center uppercase">{row.brandName}</td>
                        <td className="border border-black py-1.5 px-2 text-center font-mono font-black">{row.pallet}</td>
                        <td className="border border-black py-1.5 px-3 text-center">
                          {row.labelStatus === 'Not Available' || row.labelStatus === 'Not' ? (
                            <span className="text-rose-600 font-black">{row.labelStatus}</span>
                          ) : (
                            row.labelStatus
                          )}
                        </td>
                        <td className="border border-black py-1.5 px-3 text-center">
                          {row.remarks.includes('to be ready') ? (
                            <span className="text-[#C00000]">{row.remarks}</span>
                          ) : (
                            row.remarks
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Boxed Total Box */}
              <div className="flex justify-center my-3">
                <div className="inline-flex items-center border-2 border-black bg-white">
                  <div className="px-5 py-1.5 font-extrabold text-sm border-r-2 border-black bg-white uppercase">
                    {group.totalText}
                  </div>
                  <div className="px-6 py-1.5 font-mono font-black text-base bg-white">
                    {group.totalVal}
                  </div>
                </div>
              </div>

              {/* Red Divider Line between groups */}
              {grpIdx < activeProductDoc.groups.length - 1 && (
                <div className="h-1.5 bg-[#FF0000] w-full my-4 rounded-full" />
              )}
            </div>
          ))}

          {/* Grand Product Total */}
          <div className="mt-6 pt-3 border-t-2 border-black flex items-center justify-between font-black text-sm">
            <span>TOTAL PALLETS NEEDED FOR {activeProductDoc.productTitle.toUpperCase()}</span>
            <span className="font-mono text-base bg-[#00B0F0] text-black px-4 py-1 border-2 border-black rounded">
              {activeProductDoc.grandTotal} PALLETS
            </span>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 4: GOODS NEED TO PICK UP FROM CUSTOMER (PAGE 14 REPLICATION)          */}
      {/* ========================================================================= */}
      {activeTab === 'pickups' && (
        <div className="bg-white text-black p-4 sm:p-6 rounded-2xl border-2 border-black shadow-md max-w-[1250px] mx-auto print:border-none print:p-0 print:shadow-none print:max-w-none">
          {/* Solid RED Banner */}
          <div className="bg-[#FF0000] text-white font-black text-base uppercase tracking-wider py-2 px-4 border-b-2 border-black mb-3 text-center">
            Goods Need to Pick Up from Customer
          </div>

          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-[#FFFF00] text-black font-extrabold text-[11px] uppercase text-center">
                <th className="border border-black py-2 px-2 w-12">#</th>
                <th className="border border-black py-2 px-3 min-w-44 text-left">Customer / Party Name</th>
                <th className="border border-black py-2 px-3 w-40 text-center">Invoice / Ref / Product</th>
                <th className="border border-black py-2 px-3 min-w-44 text-left">Notes / Value</th>
                <th className="border border-black py-2 px-3 min-w-60 text-left">Action / Delivery Status</th>
              </tr>
            </thead>
            <tbody>
              {pickupItems.map((p, idx) => (
                <tr key={p.id} className="border-b border-black bg-white hover:bg-amber-50/40 text-[11.5px] font-bold">
                  <td className="border border-black py-2.5 px-2 text-center font-mono font-black">{p.id}</td>
                  <td className="border border-black py-2.5 px-3 text-left font-extrabold text-slate-900">{p.customer}</td>
                  <td className="border border-black py-2.5 px-3 text-center font-mono">{p.invoiceOrRef || '—'}</td>
                  <td className="border border-black py-2.5 px-3 text-left font-medium text-slate-800">{p.notes || '—'}</td>
                  <td className="border border-black py-2.5 px-3 text-left font-semibold text-[#C00000]">
                    {p.actionDetails || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ========================================================================= */}
      {/* HIGH-RES BOTTLE IMAGE PREVIEW MODAL                                       */}
      {/* ========================================================================= */}
      {previewImage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs animate-in fade-in">
          <div className="relative bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full p-5 border border-slate-200 dark:border-slate-800 shadow-2xl space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-black text-slate-900 dark:text-slate-100 truncate pr-4">
                {previewImage.title}
              </h4>
              <button
                type="button"
                onClick={() => setPreviewImage(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="bg-slate-50 dark:bg-slate-950 rounded-xl p-4 flex items-center justify-center border border-slate-200 dark:border-slate-800">
              <img
                src={previewImage.src}
                alt={previewImage.title}
                className="max-h-80 w-auto object-contain drop-shadow-md"
              />
            </div>
            <div className="flex items-center justify-between text-xs text-slate-500 pt-1">
              <span className="font-mono text-[10px] truncate max-w-64">{previewImage.src}</span>
              <button
                type="button"
                onClick={() => setPreviewImage(null)}
                className="px-3 py-1 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded-lg text-xs font-bold cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SOURCE PDF VIEWER MODAL                                                   */}
      {/* ========================================================================= */}
      {showPdfModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-xs animate-in fade-in">
          <div className="relative bg-white dark:bg-slate-900 rounded-2xl w-full max-w-5xl h-[88vh] flex flex-col border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-950">
              <div className="flex items-center gap-2.5">
                <FileText className="w-4 h-4 text-amber-500" />
                <h3 className="text-sm font-black text-slate-900 dark:text-slate-100">
                  Original Source: {showPdfModal.split('/').pop()}
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={showPdfModal}
                  target="_blank"
                  rel="noreferrer"
                  className="px-3 py-1 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-white dark:hover:bg-slate-800 text-xs font-bold flex items-center gap-1 cursor-pointer"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Open Fullscreen</span>
                </a>
                <button
                  type="button"
                  onClick={() => setShowPdfModal(null)}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="flex-1 bg-slate-200 dark:bg-slate-950">
              <iframe
                src={`${showPdfModal}#toolbar=1`}
                className="w-full h-full border-none"
                title="Original Sheet PDF"
              />
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
