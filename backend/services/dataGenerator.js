// Synthetic data generator with known ground truth.
// Generates 100 records using realistic Indian Rupee amounts and clearly
// SYNTHETIC Indian company names — no real businesses are implied.
// All values are fictitious test data.

function seededRandom(seed) {
  let s = seed;
  return function() {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

const rand = seededRandom(42);

function pickRandom(arr) {
  return arr[Math.floor(rand() * arr.length)];
}

function addDays(dateStr, days) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

function roundToPaise(n) {
  return Math.round(n * 100) / 100;
}

function formatAmountVariation(amount, type) {
  switch (type) {
    case 'exact': return amount;
    // A small short-payment / discount (2%–8% below)
    case 'small_diff': return roundToPaise(amount * (0.92 + rand() * 0.06));
    // Bank/processing fee deduction (₹25–₹400)
    case 'fee_deduction': return roundToPaise(amount - (25 + Math.floor(rand() * 375)));
    case 'round_to_100': return Math.round(amount / 100) * 100;
    default: return amount;
  }
}

// Synthetic Indian companies — all fictitious, generated for this demo only.
const CUSTOMER_BASES = [
  { canonical: 'Bengaluru Systems Pvt Ltd', variations: ['BENGALURU SYSTEMS', 'Bengaluru Systems', 'BGL SYSTEMS PVT LTD', 'BENGALURU SYSTEMS PVT. LTD.'] },
  { canonical: 'Acme Technologies Pvt Ltd', variations: ['ACME TECHNOLOGIES', 'Acme Tech Pvt Ltd', 'ACME TECH', 'Acme Technologies'] },
  { canonical: 'Shakti Enterprises', variations: ['SHAKTI ENTERPRISES', 'Shakti Ent.', 'SHAKTI', 'Shakti Enterprises Pvt Ltd'] },
  { canonical: 'Bharat Logistics', variations: ['BHARAT LOGISTICS', 'Bharat Log.', 'BHARAT', 'Bharat Logistics Pvt Ltd'] },
  { canonical: 'Karnataka Supplies', variations: ['KARNATAKA SUPPLIES', 'Karnataka Supp.', 'KTK SUPPLIES', 'Karnataka Supplies Co'] },
  { canonical: 'Chennai Auto Components Pvt Ltd', variations: ['CHENNAI AUTO COMPONENTS', 'Chennai Auto Comp', 'CHENNAI AUTO', 'Chennai Auto Components'] },
  { canonical: 'Hyderabad Pharma Solutions', variations: ['HYDERABAD PHARMA SOLUTIONS', 'Hyd Pharma Sol.', 'HYD PHARMA', 'Hyderabad Pharma Solutions'] },
  { canonical: 'Mumbai Textiles Pvt Ltd', variations: ['MUMBAI TEXTILES', 'Mumbai Text.', 'MUM TEXTILES', 'Mumbai Textiles'] },
  { canonical: 'Delhi Digital Services', variations: ['DELHI DIGITAL SERVICES', 'Delhi Digital', 'DLH DIGITAL', 'Delhi Digital Services Pvt Ltd'] },
  { canonical: 'Pune Engineering Works', variations: ['PUNE ENGINEERING WORKS', 'Pune Engg Works', 'PUNE ENGG', 'Pune Engineering Works'] },
  { canonical: 'Kochi Exports Pvt Ltd', variations: ['KOCHI EXPORTS', 'Kochi Exp.', 'KOCHI EXPORTS PVT', 'Kochi Exports'] },
  { canonical: 'Jaipur Handicrafts', variations: ['JAIPUR HANDICRAFTS', 'Jaipur Handi.', 'JPR HANDICRAFTS', 'Jaipur Handicrafts Pvt Ltd'] },
  { canonical: 'Ahmedabad Chem Industries', variations: ['AHMEDABAD CHEM INDUSTRIES', 'Ahmedabad Chem', 'AMD CHEM', 'Ahmedabad Chem Industries'] },
  { canonical: 'Indore Steel Works', variations: ['INDORE STEEL WORKS', 'Indore Steel', 'IND STEEL', 'Indore Steel Works Pvt Ltd'] },
  { canonical: 'Ludhiana Agro Foods', variations: ['LUDHIANA AGRO FOODS', 'Ludhiana Agro', 'LDH AGRO', 'Ludhiana Agro Foods'] },
  { canonical: 'Surat Diamond Tools', variations: ['SURAT DIAMOND TOOLS', 'Surat Diamond', 'SURAT TOOLS', 'Surat Diamond Tools Pvt Ltd'] },
  { canonical: 'Noida IT Solutions Pvt Ltd', variations: ['NOIDA IT SOLUTIONS', 'Noida IT Sol.', 'NOIDA IT', 'Noida IT Solutions'] },
  { canonical: 'Gurgaon Consulting Group', variations: ['GURGAON CONSULTING GROUP', 'Gurgaon Cons.', 'GURGAON CONSULTING', 'Gurgaon Consulting Group'] },
  { canonical: 'Nagpur Agro Exports', variations: ['NAGPUR AGRO EXPORTS', 'Nagpur Agro', 'NGP AGRO', 'Nagpur Agro Exports Pvt Ltd'] },
  { canonical: 'Varanasi Textiles', variations: ['VARANASI TEXTILES', 'Varanasi Text.', 'VNS TEXTILES', 'Varanasi Textiles Co'] },
  { canonical: 'Goa Sea Foods Pvt Ltd', variations: ['GOA SEA FOODS', 'Goa Sea Foods', 'GOA FOODS', 'Goa Sea Foods Pvt. Ltd.'] },
  { canonical: 'Coimbatore Pump Industries', variations: ['COIMBATORE PUMP INDUSTRIES', 'Coimbatore Pumps', 'CBE PUMPS', 'Coimbatore Pump Industries'] },
  { canonical: 'Bhopal Solar Energy', variations: ['BHOPAL SOLAR ENERGY', 'Bhopal Solar', 'BPL SOLAR', 'Bhopal Solar Energy Pvt Ltd'] },
  { canonical: 'Chandigarh Furniture Works', variations: ['CHANDIGARH FURNITURE WORKS', 'Chandigarh Furniture', 'CHD FURNITURE', 'Chandigarh Furniture Works'] },
  { canonical: 'Patna Agro Industries', variations: ['PATNA AGRO INDUSTRIES', 'Patna Agro', 'PAT AGRO', 'Patna Agro Industries Pvt Ltd'] },
  { canonical: 'Raipur Steel Traders', variations: ['RAIPUR STEEL TRADERS', 'Raipur Steel', 'RPR STEEL', 'Raipur Steel Traders'] },
  { canonical: 'Guwahati Tea Traders', variations: ['GUWAHATI TEA TRADERS', 'Guwahati Tea', 'GHY TEA', 'Guwahati Tea Traders Pvt Ltd'] },
  { canonical: 'Bhubaneswar Engineering', variations: ['BHUBANESWAR ENGINEERING', 'Bhubaneswar Engg', 'BBSR ENGG', 'Bhubaneswar Engineering Works'] },
  { canonical: 'Mysuru Silk Traders', variations: ['MYSURU SILK TRADERS', 'Mysuru Silk', 'MYS SILK', 'Mysuru Silk Traders'] },
  { canonical: 'Jodhpur Ceramics Pvt Ltd', variations: ['JODHPUR CERAMICS', 'Jodhpur Cer.', 'JDP CERAMICS', 'Jodhpur Ceramics'] },
];

const ACCOUNT_IDS = ['ACC-001', 'ACC-002', 'ACC-003', 'ACC-004', 'ACC-005'];
const DESCRIPTION_TEMPLATES = [
  'NEFT PAYMENT {customer} INV{invNum}',
  '{customer} PAYMENT INV{invNum}',
  'RTGS INWARD {customer}',
  'UPI PAYMENT FOR INV{invNum}',
  '{customer} INV{invNum} NEFT',
  'IMPS INWARD {customer}',
  'NACH CREDIT {customer}',
  'BANK TRANSFER {customer} INV{invNum}',
  'ONLINE PAYMENT {customer}',
  'NEFT {customer} INV{invNum}',
  'Payment for invoice {invNum}',
  '{customer} RTGS payment',
  'NEFT CREDIT {customer}',
  'Payment - {customer}',
  'NACH deposit - INV{invNum}',
];

function randomAmount(min, max) {
  return roundToPaise(min + rand() * (max - min));
}

export function generateDemoDataset() {
  const invoices = [];
  const payments = [];
  const transactions = [];
  const groundTruth = [];
  
  const usedPayments = new Set();
  const usedTransactions = new Set();
  
  let paymentCounter = 1;
  let txCounter = 1;
  
  // 100 invoices with realistic INR invoice values (₹5,000 – ₹6,00,000)
  for (let i = 0; i < 100; i++) {
    const invoiceId = `INV-${String(1001 + i)}`;
    const customerBase = CUSTOMER_BASES[i % CUSTOMER_BASES.length];
    const customer = customerBase.canonical;
    const amount = randomAmount(5000, 600000);
    const invDate = `2026-08-${String(Math.floor(1 + rand() * 28)).padStart(2, '0')}`;
    const dueDate = addDays(invDate, 30);
    const currency = 'INR';
    const accountId = pickRandom(ACCOUNT_IDS);
    
    invoices.push({
      invoice_id: invoiceId,
      customer,
      invoice_date: invDate,
      due_date: dueDate,
      amount,
      currency,
      account_id: accountId,
    });
  }
  
  const categories = [];
  for (let i = 0; i < 50; i++) categories.push('exact');
  for (let i = 0; i < 10; i++) categories.push('name_variation');
  for (let i = 0; i < 10; i++) categories.push('date_variation');
  for (let i = 0; i < 8; i++) categories.push('amount_discrepancy');
  for (let i = 0; i < 7; i++) categories.push('missing');
  for (let i = 0; i < 5; i++) categories.push('duplicate');
  for (let i = 0; i < 5; i++) categories.push('ambiguous');
  for (let i = 0; i < 5; i++) categories.push('unmatched');
  
  for (let i = categories.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [categories[i], categories[j]] = [categories[j], categories[i]];
  }
  while (categories.length < 100) categories.push('exact');
  categories.length = 100;
  
  for (let i = 0; i < 100; i++) {
    const inv = invoices[i];
    const category = categories[i];
    const customerBase = CUSTOMER_BASES[i % CUSTOMER_BASES.length];
    const invNum = inv.invoice_id.replace('INV-', '');
    
    if (category === 'missing' || category === 'unmatched') {
      groundTruth.push({
        invoice_id: inv.invoice_id,
        payment_id: null,
        transaction_id: null,
        match_type: category === 'missing' ? 'MISSING' : 'NO_MATCH',
        category,
      });
      continue;
    }
    
    const payId = `PAY-${String(paymentCounter++).padStart(4, '0')}`;
    const txId = `TX-${String(txCounter++).padStart(4, '0')}`;
    
    let payCustomer, payAmount, payDate, payDesc;
    let txAmount, txDate, txDesc;
    
    switch (category) {
      case 'exact': {
        payCustomer = inv.customer;
        payAmount = inv.amount;
        payDate = addDays(inv.invoice_date, Math.floor(rand() * 5) + 1);
        payDesc = pickRandom(DESCRIPTION_TEMPLATES).replace('{customer}', inv.customer).replace('{invNum}', invNum);
        txAmount = inv.amount;
        txDate = payDate;
        txDesc = pickRandom(DESCRIPTION_TEMPLATES).replace('{customer}', inv.customer).replace('{invNum}', invNum);
        break;
      }
      case 'name_variation': {
        payCustomer = pickRandom(customerBase.variations);
        payAmount = inv.amount;
        payDate = addDays(inv.invoice_date, Math.floor(rand() * 5) + 1);
        payDesc = pickRandom(DESCRIPTION_TEMPLATES).replace('{customer}', payCustomer).replace('{invNum}', invNum);
        txAmount = inv.amount;
        txDate = payDate;
        txDesc = pickRandom(DESCRIPTION_TEMPLATES).replace('{customer}', payCustomer).replace('{invNum}', invNum);
        break;
      }
      case 'date_variation': {
        payCustomer = inv.customer;
        payAmount = inv.amount;
        const dayOffset = Math.floor(rand() * 12) + 6;
        payDate = addDays(inv.invoice_date, dayOffset);
        payDesc = pickRandom(DESCRIPTION_TEMPLATES).replace('{customer}', inv.customer).replace('{invNum}', invNum);
        txAmount = inv.amount;
        txDate = payDate;
        txDesc = pickRandom(DESCRIPTION_TEMPLATES).replace('{customer}', inv.customer).replace('{invNum}', invNum);
        break;
      }
      case 'amount_discrepancy': {
        payCustomer = inv.customer;
        const diffType = pickRandom(['small_diff', 'fee_deduction']);
        payAmount = formatAmountVariation(inv.amount, diffType);
        payDate = addDays(inv.invoice_date, Math.floor(rand() * 5) + 1);
        payDesc = pickRandom(DESCRIPTION_TEMPLATES).replace('{customer}', inv.customer).replace('{invNum}', invNum);
        txAmount = payAmount;
        txDate = payDate;
        txDesc = pickRandom(DESCRIPTION_TEMPLATES).replace('{customer}', inv.customer).replace('{invNum}', invNum);
        break;
      }
      case 'duplicate': {
        payCustomer = inv.customer;
        payAmount = inv.amount;
        payDate = addDays(inv.invoice_date, Math.floor(rand() * 5) + 1);
        payDesc = pickRandom(DESCRIPTION_TEMPLATES).replace('{customer}', inv.customer).replace('{invNum}', invNum);
        txAmount = inv.amount;
        txDate = payDate;
        txDesc = pickRandom(DESCRIPTION_TEMPLATES).replace('{customer}', inv.customer).replace('{invNum}', invNum);
        
        const dupPayId = `PAY-${String(paymentCounter++).padStart(4, '0')}`;
        const dupPayDate = addDays(payDate, Math.floor(rand() * 3));
        payments.push({
          payment_id: dupPayId,
          customer: inv.customer,
          payment_date: dupPayDate,
          amount: inv.amount,
          currency: 'INR',
          description: `DUP: ${payDesc}`,
          account_id: inv.account_id,
        });
        
        groundTruth.push({
          invoice_id: inv.invoice_id,
          payment_id: payId,
          transaction_id: txId,
          match_type: 'DUPLICATE',
          category,
        });
        break;
      }
      case 'ambiguous': {
        payCustomer = inv.customer;
        payAmount = inv.amount;
        payDate = addDays(inv.invoice_date, Math.floor(rand() * 5) + 1);
        payDesc = pickRandom(DESCRIPTION_TEMPLATES).replace('{customer}', inv.customer).replace('{invNum}', invNum);
        
        const ambPayId = `PAY-${String(paymentCounter++).padStart(4, '0')}`;
        const ambAmount = roundToPaise(inv.amount * (0.97 + rand() * 0.06));
        payments.push({
          payment_id: ambPayId,
          customer: pickRandom(customerBase.variations),
          payment_date: addDays(inv.invoice_date, Math.floor(rand() * 5) + 1),
          amount: ambAmount,
          currency: 'INR',
          description: pickRandom(DESCRIPTION_TEMPLATES).replace('{customer}', inv.customer).replace('{invNum}', invNum),
          account_id: inv.account_id,
        });
        
        txAmount = inv.amount;
        txDate = payDate;
        txDesc = pickRandom(DESCRIPTION_TEMPLATES).replace('{customer}', inv.customer).replace('{invNum}', invNum);
        break;
      }
      default: {
        payCustomer = inv.customer;
        payAmount = inv.amount;
        payDate = addDays(inv.invoice_date, 2);
        payDesc = `PAYMENT ${inv.customer} INV${invNum}`;
        txAmount = inv.amount;
        txDate = payDate;
        txDesc = `PAYMENT ${inv.customer} INV${invNum}`;
      }
    }
    
    payments.push({
      payment_id: payId,
      customer: payCustomer,
      payment_date: payDate,
      amount: payAmount,
      currency: 'INR',
      description: payDesc,
      account_id: inv.account_id,
    });
    
    transactions.push({
      transaction_id: txId,
      transaction_date: txDate,
      amount: txAmount,
      currency: 'INR',
      description: txDesc,
      account_id: inv.account_id,
    });
    
    if (category !== 'duplicate') {
      groundTruth.push({
        invoice_id: inv.invoice_id,
        payment_id: payId,
        transaction_id: txId,
        match_type: category === 'exact' ? 'EXACT' : 'FUZZY',
        category,
      });
    }
  }
  
  return { invoices, payments, transactions, groundTruth };
}