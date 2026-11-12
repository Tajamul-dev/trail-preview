from pypdf import PdfReader
import re

r = PdfReader('/Users/a1234/.deepai-code/userdata/attachments/5b21dd2e-9878-4e01-b205-e631bbdb31ae-5504da50-7a84-4228-b093-5a63f1ef4dbb-pdf.pdf')
lines = []
for p in r.pages:
    for ln in (p.extract_text() or '').split('\n'):
        ln = ln.strip()
        if ln:
            lines.append(ln)

qty_re = re.compile(r'(\d+\s*[xX]\s*\d+(?:\.\d+)?\s*PALLETS?|\d+(?:\.\d+)?\s*PALLETS?|\d+\s*[xX]\s*\d+\s*CASES?|\d+(?:\.\d+)?\s*CASES?|\d+/\d+\s*PALLETS?)', re.I)
price_re = re.compile(r'\$\s*(\d+(?:\.\d+)?)')
do_re = re.compile(r'^(\d{3,5})\s+(\d{1,2}\.\d{1,2}\.\d{2,4})?\b')

orders = []
cur = None
def flush():
    global cur
    if cur and (cur['customer'] or cur['doNo']):
        orders.append(cur)
    cur = None

for ln in lines:
    if re.match(r'^(Page \d+ of \d+|DO NO\.|PENDING|Product|Today|United States)$', ln, re.I):
        continue
    if 'Delivery Plan' in ln or 'Production Plan' in ln or ln.startswith('(SKU)') or ln.startswith('Product Name'):
        continue
    m = re.match(r'^(\d{3,5})\b(.*)$', ln)
    if m and not qty_re.search(ln):
        flush()
        cur = {'doNo': m.group(1), 'poDate': '', 'customer': '', 'salesExec': '', 'address': '', 'items': []}
        rest = m.group(2).strip()
        if rest:
            cur['poDate'] = rest
        continue
    if cur is None:
        continue
    if qty_re.search(ln):
        qm = qty_re.search(ln)
        qty = qm.group(1)
        pm = price_re.search(ln)
        price = ('$' + pm.group(1)) if pm else ''
        before = ln[:qm.start()].strip()
        after = ln[qm.end():].strip()
        # item = 'before' text; labelOrdered/labelReceived from after
        lo_m = re.search(r'\b(Yes|Not)\b', after, re.I)
        label_ordered = lo_m.group(1) if lo_m else ''
        after2 = after[lo_m.end():].strip() if lo_m else after
        lr_m = re.search(r'\b(Received|Available|Not Label|Without Label|Not)\b', after2, re.I)
        label_received = lr_m.group(1) if lr_m else ''
        remarks = after2[lr_m.end():].strip(' .|') if lr_m else after2
        cur['items'].append({'item': before, 'brand': '', 'qty': qty, 'salePrice': price,
                             'labelOrdered': label_ordered, 'labelReceived': label_received, 'remarks': remarks})
        continue
    # non-item line inside block: customer/exec/address continuation
    if cur['items']:
        cur['items'][-1]['remarks'] = (cur['items'][-1]['remarks'] + ' ' + ln).strip()
    elif not cur['customer']:
        cur['customer'] = ln
    elif not cur['salesExec']:
        cur['salesExec'] = ln
    else:
        cur['address'] = (cur['address'] + ' ' + ln).strip()
flush()

print('ORDERS:', len(orders), '| ITEMS:', sum(len(o['items']) for o in orders))
for o in orders[:8]:
    print('-', o['doNo'], '|', o['poDate'], '|', o['customer'][:28], '|', len(o['items']), 'items |', o['items'][0]['item'][:30], '|', o['items'][0]['qty'], '|', o['items'][0]['salePrice'], '|', o['items'][0]['labelOrdered'] + '/' + o['items'][0]['labelReceived'])
print('...')
bad = [o for o in orders if '|' in o['customer'] or any('|' in i['item'] for i in o['items'])]
print('garbage orders:', len(bad))
no_item = [o for o in orders if not o['items']]
print('orders without items:', len(no_item))
