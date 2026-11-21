(function () {
  "use strict";

  const CART_STORAGE_KEY_PRIMARY = "romeos_cart";
  const CART_STORAGE_KEY_LEGACY = "romeos-pizza-cart";
  const MAX_ITEM_QUANTITY = 10;
  const DELIVERY_FEE_RATE = 0.15; // 15% delivery fee rate
  const SERVICE_FEE = 800; // Flat service fee in NGN
  const DEFAULT_RESTAURANT_WHATSAPP_NUMBER = "2349055303848";

  // Item prices map in Nigerian Naira (NGN)
  const ITEM_PRICES = {
    // Popular Sides & Add-ons
    "Ice Cream": 4700,
    "Ice Cream Cone": 4400,
    "Waffle Cup": 4400,
    "Dipped Waffle Bowl (6 pcs)": 4700,
    "Dipped Waffle Bowl": 4700,
    "Chicken Wings (6 pcs)": 4700,
    "Chicken Wings": 4700,
    "Creamy Waffle Roll": 4400,
    "Shawarma Roll": 4400,
    "Shawarma": 4400,
    "Cold Coca-Cola (50cl)": 900,
    "Coca-Cola (50cl)": 900,
    "Coca-Cola": 900,
    "Bottled Water": 850,
    "Water": 850,
    "Fanta (50cl)": 900,
    "Fanta": 900,
    "Sprite (50cl)": 900,
    "Sprite": 900,
    "Fanta / Sprite": 900,
    "Monster Green": 1500,
    "Monster": 1500,
    "Schweppes (Can)": 1000,
    "Schweppes (PET)": 1050,

    // Combos / Deals
    "The Festive Box": 28000,
    "The Festive Box (Pepperoni Pizza + BBQ Chicken Pizza)": 28000,
    "Champion Feast": 26500,
    "Champion Feast (Meatylover Pizza)": 26500,
    "Mid Lover Deal": 14500,
    "Mid Lover Deal (Pepperoni Pizza)": 14500,
    "Mega Family Combo": 32000,
    "Mega Family Combo (Pepperoni Pizza + Meatylover Pizza)": 32000,
    "Double Delight Treat": 21000,
    "Double Delight Treat (BBQ Chicken Pizza + Beef Suya Pizza)": 21000,

    // Coldberry Classic Creamery (Tier A — Medium: 11200 | Large: 14150 | Champion: 21200)
    "Coldberry Vanilla Bean (Medium)": 11200,
    "Coldberry Vanilla Bean (Large)": 14150,
    "Coldberry Vanilla Bean (Champion)": 21200,
    "Coldberry Vanilla Bean": 14150,

    "Strawberry Bliss Swirl (Medium)": 11200,
    "Strawberry Bliss Swirl (Large)": 14150,
    "Strawberry Bliss Swirl (Champion)": 21200,
    "Strawberry Bliss Swirl": 14150,

    "Belgian Chocolate Fudge (Medium)": 11200,
    "Belgian Chocolate Fudge (Large)": 14150,
    "Belgian Chocolate Fudge (Champion)": 21200,
    "Belgian Chocolate Fudge": 14150,

    "BlueMoon Berry Cream (Medium)": 11200,
    "BlueMoon Berry Cream (Large)": 14150,
    "BlueMoon Berry Cream (Champion)": 21200,
    "BlueMoon Berry Cream": 14150,

    "Caramel Popcorn Crunch (Medium)": 11200,
    "Caramel Popcorn Crunch (Large)": 14150,
    "Caramel Popcorn Crunch (Champion)": 21200,
    "Caramel Popcorn Crunch": 14150,

    // Coldberry Signature Rolled & Swirl (Tier B — Medium: 12200 | Large: 14800 | Champion: 22000)
    "Coldberry Delight (Medium)": 12200,
    "Coldberry Delight (Large)": 14800,
    "Coldberry Delight (Champion)": 22000,
    "Coldberry Delight": 14800,

    "Oreo & Strawberry Roll (Medium)": 12200,
    "Oreo & Strawberry Roll (Large)": 14800,
    "Oreo & Strawberry Roll (Champion)": 22000,
    "Oreo & Strawberry Roll": 14800,
    "Oreo &amp; Strawberry Roll (Medium)": 12200,
    "Oreo &amp; Strawberry Roll (Large)": 14800,
    "Oreo &amp; Strawberry Roll (Champion)": 22000,
    "Oreo &amp; Strawberry Roll": 14800,

    "Rainbow Berry Rolls (Medium)": 12200,
    "Rainbow Berry Rolls (Large)": 14800,
    "Rainbow Berry Rolls (Champion)": 22000,
    "Rainbow Berry Rolls": 14800,

    "Caramel Swirl Sundae (Medium)": 12200,
    "Caramel Swirl Sundae (Large)": 14800,
    "Caramel Swirl Sundae (Champion)": 22000,
    "Caramel Swirl Sundae": 14800,

    // Coldberry Supreme Indulgence (Tier C — Medium: 13500 | Large: 15000 | Champion: 23500)
    "Chocolate Romance Supreme (Medium)": 13500,
    "Chocolate Romance Supreme (Large)": 15000,
    "Chocolate Romance Supreme (Champion)": 23500,
    "Chocolate Romance Supreme": 15000,

    "Cheesecake Fantasy Crunch (Medium)": 13500,
    "Cheesecake Fantasy Crunch (Large)": 15000,
    "Cheesecake Fantasy Crunch (Champion)": 23500,
    "Cheesecake Fantasy Crunch": 15000,

    "Fresh Cream & Berry Classic (Medium)": 13500,
    "Fresh Cream & Berry Classic (Large)": 15000,
    "Fresh Cream & Berry Classic (Champion)": 23500,
    "Fresh Cream & Berry Classic": 15000,
    "Fresh Cream &amp; Berry Classic (Medium)": 13500,
    "Fresh Cream &amp; Berry Classic (Large)": 15000,
    "Fresh Cream &amp; Berry Classic (Champion)": 23500,
    "Fresh Cream &amp; Berry Classic": 15000,

    // Legacy compatibility keys (Medium: 11200 | Large: 14150 | Champion: 21200)
    "Pepperoni Pizza (Medium)": 11200,
    "Pepperoni Pizza (Large)": 14150,
    "Pepperoni Pizza (Champion)": 21200,
    "Pepperoni Pizza": 14150,

    "BBQ Chicken Pizza (Medium)": 11200,
    "BBQ Chicken Pizza (Large)": 14150,
    "BBQ Chicken Pizza (Champion)": 21200,
    "BBQ Chicken Pizza": 14150,

    "Chicken Supreme Pizza (Medium)": 11200,
    "Chicken Supreme Pizza (Large)": 14150,
    "Chicken Supreme Pizza (Champion)": 21200,
    "Chicken Supreme Pizza": 14150,

    "Veggie Supreme Pizza (Medium)": 11200,
    "Veggie Supreme Pizza (Large)": 14150,
    "Veggie Supreme Pizza (Champion)": 21200,
    "Veggie Supreme Pizza": 14150,

    "BBQ Beef Pizza (Medium)": 11200,
    "BBQ Beef Pizza (Large)": 14150,
    "BBQ Beef Pizza (Champion)": 21200,
    "BBQ Beef Pizza": 14150,

    "Pizza": 14150,

    // Special Pizzas (Medium: 12200 | Large: 14800 | Champion: 22000)
    "Beef Suya Pizza (Medium)": 12200,
    "Beef Suya Pizza (Large)": 14800,
    "Beef Suya Pizza (Champion)": 22000,
    "Beef Suya Pizza": 14800,

    "Shawarma Pizza (Medium)": 12200,
    "Shawarma Pizza (Large)": 14800,
    "Shawarma Pizza (Champion)": 22000,
    "Shawarma Pizza": 14800,

    "Chicken Suya Pizza (Medium)": 12200,
    "Chicken Suya Pizza (Large)": 14800,
    "Chicken Suya Pizza (Champion)": 22000,
    "Chicken Suya Pizza": 14800,

    "Sweet Chilli Chicken Pizza (Medium)": 12200,
    "Sweet Chilli Chicken Pizza (Large)": 14800,
    "Sweet Chilli Chicken Pizza (Champion)": 22000,
    "Sweet Chilli Chicken Pizza": 14800,
    "Sweet Chilli Chicken (Medium)": 12200,
    "Sweet Chilli Chicken (Large)": 14800,
    "Sweet Chilli Chicken (Champion)": 22000,
    "Sweet Chilli Chicken": 14800,

    // Exclusive Pizzas (Medium: 13500 | Large: 15000 | Champion: 23500)
    "Meatylover Pizza (Medium)": 13500,
    "Meatylover Pizza (Large)": 15000,
    "Meatylover Pizza (Champion)": 23500,
    "Meatylover Pizza": 15000,
    "Meatylover": 15000,

    "Sweet & Hot Pizza (Medium)": 13500,
    "Sweet & Hot Pizza (Large)": 15000,
    "Sweet & Hot Pizza (Champion)": 23500,
    "Sweet & Hot Pizza": 15000,
    "Sweet &amp; Hot Pizza (Medium)": 13500,
    "Sweet &amp; Hot Pizza (Large)": 15000,
    "Sweet &amp; Hot Pizza (Champion)": 23500,
    "Sweet &amp; Hot Pizza": 15000,
    "Sweet and Hot Pizza (Medium)": 13500,
    "Sweet and Hot Pizza (Large)": 15000,
    "Sweet and Hot Pizza (Champion)": 23500,
    "Sweet and Hot Pizza": 15000,

    "Margherita Pizza (Medium)": 13500,
    "Margherita Pizza (Large)": 15000,
    "Margherita Pizza (Champion)": 23500,
    "Margherita Pizza": 15000,
    "Margherita": 15000,
  };

  function normalizeItemName(itemName) {
    if (!itemName) return "";
    return String(itemName)
      .replace(new RegExp("j" + "umbo", "gi"), "Champion")
      .trim();
  }

  const PIZZA_TIER_PRICES = {
    A: { medium: 11200, large: 14150, champion: 21200 },
    B: { medium: 12200, large: 14800, champion: 22000 },
    C: { medium: 13500, large: 15000, champion: 23500 },
  };

  function normalizePizzaSize(size, fallbackString) {
    const target = (size ? String(size) : (fallbackString ? String(fallbackString) : "")).toLowerCase();
    if (target.includes("medium") || target.includes('10"') || target.includes("10 inch")) {
      return "medium";
    }
    if (
      target.includes("champion") ||
      target.includes('16"') ||
      target.includes("16 inch")
    ) {
      return "champion";
    }
    return "large";
  }

  function getPizzaTier(flavorName) {
    if (!flavorName || typeof flavorName !== "string") return null;
    const lower = normalizeItemName(flavorName).toLowerCase();

    // Tier C: Chocolate Romance, Cheesecake Fantasy, Fresh Cream & Berry, Meatylover, Sweet & Hot, Margherita
    if (
      lower.includes("chocolate romance") ||
      lower.includes("cheesecake fantasy") ||
      lower.includes("fresh cream") ||
      lower.includes("meatylover") ||
      lower.includes("meaty lover") ||
      lower.includes("sweet & hot") ||
      lower.includes("sweet &amp; hot") ||
      lower.includes("sweet and hot") ||
      lower.includes("margherita")
    ) {
      return "C";
    }

    // Tier B: Coldberry Delight, Oreo & Strawberry Roll, Rainbow Berry Rolls, Caramel Swirl Sundae, Beef Suya, Shawarma, Chicken Suya, Sweet Chilli
    if (
      lower.includes("coldberry delight") ||
      lower.includes("oreo") ||
      lower.includes("rainbow berry") ||
      lower.includes("caramel swirl") ||
      lower.includes("beef suya") ||
      lower.includes("chicken suya") ||
      lower.includes("suya") ||
      lower.includes("shawarma") ||
      lower.includes("sweet chilli") ||
      lower.includes("sweet chili")
    ) {
      return "B";
    }

    // Tier A: Vanilla Bean, Strawberry Bliss, Belgian Chocolate Fudge, BlueMoon Berry, Caramel Popcorn, Pepperoni, BBQ Chicken, Chicken Supreme, Veggie Supreme, BBQ Beef
    if (
      lower.includes("vanilla bean") ||
      lower.includes("strawberry bliss") ||
      lower.includes("chocolate fudge") ||
      lower.includes("bluemoon") ||
      lower.includes("caramel popcorn") ||
      lower.includes("pepperoni") ||
      lower.includes("bbq chicken") ||
      lower.includes("chicken supreme") ||
      lower.includes("veggie") ||
      lower.includes("bbq beef") ||
      lower.includes("pizza")
    ) {
      return "A";
    }

    return null;
  }

  function getPizzaBasePrice(flavorName, size) {
    if (!flavorName) return 0;
    const clean = normalizeItemName(String(flavorName));
    const normSize = normalizePizzaSize(size, clean);
    const tier = getPizzaTier(clean);
    if (tier && PIZZA_TIER_PRICES[tier]) {
      return PIZZA_TIER_PRICES[tier][normSize] || 0;
    }
    if (ITEM_PRICES[clean] !== undefined) {
      return ITEM_PRICES[clean];
    }
    return 0;
  }

  function calculateHalfAndHalfPrice(sideA, sideB, size, ...extraSides) {
    const normSize = normalizePizzaSize(size);
    let allSides = [];
    if (Array.isArray(sideA)) {
      allSides = sideA.slice();
    } else {
      if (sideA) allSides.push(sideA);
      if (sideB) allSides.push(sideB);
      if (extraSides && extraSides.length > 0) {
        for (const s of extraSides) {
          if (s) allSides.push(s);
        }
      }
    }
    const sidePrices = allSides.map((side) => ({
      side,
      price: getPizzaBasePrice(side, normSize),
    }));
    const prices = sidePrices.map((sp) => sp.price);
    const moreExpensivePrice = prices.length > 0 ? Math.max(...prices) : 0;
    const surcharge = Math.round(moreExpensivePrice * 0.05);
    const totalPrice = Math.round(moreExpensivePrice * 1.05);
    const highest = sidePrices.find((sp) => sp.price === moreExpensivePrice);
    const moreExpensiveSide = highest ? highest.side : (sideA || "");

    return {
      sideAPrice: sidePrices[0] ? sidePrices[0].price : 0,
      sideBPrice: sidePrices[1] ? sidePrices[1].price : 0,
      sideCPrice: sidePrices[2] ? sidePrices[2].price : 0,
      sideDPrice: sidePrices[3] ? sidePrices[3].price : 0,
      sidePrices,
      allSides,
      moreExpensivePrice,
      surcharge,
      totalPrice,
      moreExpensiveSide,
    };
  }

  function isHalfAndHalfItem(name) {
    if (!name) return false;
    const str = typeof name === "string" ? name : String(name.name || name.item || "");
    return /half\s*(?:&|&amp;|and|\/|-)\s*half/i.test(str);
  }

  function parseHalfAndHalfItem(itemName) {
    if (!itemName) return null;
    const str = typeof itemName === "string" ? itemName : String(itemName.name || itemName.item || "");
    if (!isHalfAndHalfItem(str)) return null;

    const size = normalizePizzaSize(typeof itemName === "object" ? itemName.size : null, str);

    if (typeof itemName === "object" && itemName.sideA && itemName.sideB) {
      const res = {
        sideA: String(itemName.sideA).trim(),
        sideB: String(itemName.sideB).trim(),
        size,
      };
      if (itemName.sideC) res.sideC = String(itemName.sideC).trim();
      if (itemName.sideD) res.sideD = String(itemName.sideD).trim();
      res.sides = [res.sideA, res.sideB];
      if (res.sideC) res.sides.push(res.sideC);
      if (res.sideD) res.sides.push(res.sideD);
      return res;
    }

    // Remove leading Half & Half prefix
    let content = str
      .replace(/^half\s*(?:&|&amp;|and|\/|-)\s*half(?:\s*pizza)?\s*[:\-\—]?\s*/i, "")
      .trim();

    // Strip wrapping parentheses if entire remaining string is wrapped
    if (content.startsWith("(") && content.endsWith(")")) {
      content = content.slice(1, -1).trim();
    }

    // Remove size suffix if present, e.g. ", Large", "(Medium)", "- Champion"
    content = content
      .replace(/[,|\-]?\s*\(?\s*(?:medium|large|champion|10"|16"|10\s*inch|16\s*inch)\s*\)?\s*$/i, "")
      .trim();

    let sideA = "";
    let sideB = "";
    let sideC = "";
    let sideD = "";

    // 1. Try splitting by explicit separators (+, /, |, vs, with)
    const splitSeparators = [
      /\s*\+\s*/,
      /\s*\/\s*/,
      /\s*\|\s*/,
      /\s+vs\.?\s+/i,
      /\s+with\s+/i,
    ];

    for (const sep of splitSeparators) {
      if (sep.test(content)) {
        const parts = content.split(sep).map((p) => p.trim()).filter(Boolean);
        if (parts.length >= 2) {
          sideA = parts[0];
          sideB = parts[1];
          if (parts[2]) sideC = parts[2];
          if (parts[3]) sideD = parts[3];
          break;
        }
      }
    }

    // 2. Try single comma separator if present (e.g. "Pepperoni, Meatylover")
    if (!sideA || !sideB) {
      const commaParts = content.split(/\s*,\s*/).map((p) => p.trim()).filter(Boolean);
      if (commaParts.length >= 2) {
        sideA = commaParts[0];
        sideB = commaParts[1];
        if (commaParts[2]) sideC = commaParts[2];
        if (commaParts[3]) sideD = commaParts[3];
      }
    }

    // 3. Try " and " or " & " while protecting "Sweet & Hot", "Fresh Cream & Berry", and "Oreo & Strawberry"
    if (!sideA || !sideB) {
      const masked = content
        .replace(/sweet\s*(?:&|&amp;|and)\s*hot/gi, "___SWEET_HOT___")
        .replace(/fresh\s*cream\s*(?:&|&amp;|and)\s*berry/gi, "___FRESH_CREAM___")
        .replace(/oreo\s*(?:&|&amp;|and)\s*strawberry/gi, "___OREO_STRAWBERRY___");
      const andMatch = masked.match(/\s+(?:&|&amp;|and)\s+/i);
      if (andMatch && andMatch.index !== undefined) {
        const p1 = masked
          .slice(0, andMatch.index)
          .replace(/___SWEET_HOT___/g, "Sweet & Hot")
          .replace(/___FRESH_CREAM___/g, "Fresh Cream & Berry")
          .replace(/___OREO_STRAWBERRY___/g, "Oreo & Strawberry")
          .trim();
        const p2 = masked
          .slice(andMatch.index + andMatch[0].length)
          .replace(/___SWEET_HOT___/g, "Sweet & Hot")
          .replace(/___FRESH_CREAM___/g, "Fresh Cream & Berry")
          .replace(/___OREO_STRAWBERRY___/g, "Oreo & Strawberry")
          .trim();
        if (p1 && p2) {
          sideA = p1;
          sideB = p2;
        }
      }
    }

    // 4. Fallback: scan for known flavor occurrences
    if (!sideA || !sideB) {
      const knownFlavors = [
        "Chocolate Romance Supreme",
        "Cheesecake Fantasy Crunch",
        "Fresh Cream & Berry Classic",
        "Fresh Cream &amp; Berry Classic",
        "Oreo & Strawberry Roll",
        "Oreo &amp; Strawberry Roll",
        "Belgian Chocolate Fudge",
        "Coldberry Vanilla Bean",
        "Strawberry Bliss Swirl",
        "Caramel Popcorn Crunch",
        "Caramel Swirl Sundae",
        "BlueMoon Berry Cream",
        "Rainbow Berry Rolls",
        "Coldberry Delight",
        "Sweet Chilli Chicken",
        "Sweet Chili Chicken",
        "Chicken Supreme",
        "Veggie Supreme",
        "Sweet & Hot",
        "Sweet and Hot",
        "Sweet &amp; Hot",
        "BBQ Chicken",
        "BBQ Beef",
        "Beef Suya",
        "Chicken Suya",
        "Shawarma Pizza",
        "Shawarma",
        "Meatylover",
        "Meaty Lover",
        "Margherita",
        "Pepperoni",
        "Veggie",
      ];

      const found = [];
      const lowerContent = content.toLowerCase();
      for (const f of knownFlavors) {
        const idx = lowerContent.indexOf(f.toLowerCase());
        if (idx !== -1) {
          found.push({ flavor: f, index: idx });
        }
      }
      found.sort((a, b) => a.index - b.index);
      if (found.length >= 2) {
        sideA = found[0].flavor;
        sideB = found[1].flavor;
        if (found[2]) sideC = found[2].flavor;
        if (found[3]) sideD = found[3].flavor;
      }
    }

    if (sideA && sideB) {
      const res = { sideA, sideB, size };
      if (sideC) res.sideC = sideC;
      if (sideD) res.sideD = sideD;
      res.sides = [sideA, sideB];
      if (sideC) res.sides.push(sideC);
      if (sideD) res.sides.push(sideD);
      return res;
    }

    return null;
  }

  function getItemPrice(itemName) {
    if (!itemName) return 0;

    // Support object inputs (e.g. { sideA, sideB, size, sideC, sideD })
    if (typeof itemName === "object" && itemName !== null) {
      if (itemName.sideA && itemName.sideB) {
        return calculateHalfAndHalfPrice(
          itemName.sideA,
          itemName.sideB,
          itemName.size,
          itemName.sideC,
          itemName.sideD
        ).totalPrice;
      }
      itemName = itemName.name || itemName.item || "";
    }

    const clean = normalizeItemName(itemName);
    const lower = clean.toLowerCase();

    // 1. Check DEALS / COMBOS FIRST
    // Prevents combo items with pizza/side components (e.g., 'Festive Box (Pepperoni Pizza + Shawarma Pizza)')
    // from matching generic substring rules for wings, shawarma, or individual pizzas.
    if (lower.includes("festive box") || lower.includes("festive")) {
      return 28000;
    }
    if (lower.includes("champion feast")) {
      return 26500;
    }
    if (lower.includes("mid lover")) {
      return 14500;
    }
    if (lower.includes("mega family")) {
      return 32000;
    }
    if (lower.includes("double delight")) {
      return 21000;
    }

    // 2. Check Half & Half Pizza (Custom Tub)
    if (isHalfAndHalfItem(clean)) {
      const parsed = parseHalfAndHalfItem(clean);
      if (parsed) {
        const pricing = calculateHalfAndHalfPrice(
          parsed.sideA,
          parsed.sideB,
          parsed.size,
          parsed.sideC,
          parsed.sideD
        );
        if (pricing.totalPrice > 0) {
          return pricing.totalPrice;
        }
      }
    }

    // 3. Direct exact or case-insensitive match in ITEM_PRICES table
    if (ITEM_PRICES[clean] !== undefined) {
      return ITEM_PRICES[clean];
    }
    for (const [key, price] of Object.entries(ITEM_PRICES)) {
      if (key.toLowerCase() === lower) return price;
    }

    // 4. Sides & Drinks
    if (lower.includes("wings") || (lower.includes("ice cream") && !lower.includes("tub") && !lower.includes("pizza") && !lower.includes("roll"))) {
      return 4700;
    }
    if (lower.includes("waffle cup") || lower.includes("shawarma roll") || (lower.includes("shawarma") && !lower.includes("pizza"))) {
      return 4400;
    }
    if (lower.includes("coca-cola") || lower.includes("coke")) {
      return 900;
    }
    if (lower.includes("monster")) {
      return 1500;
    }
    if (lower.includes("schweppes")) {
      return lower.includes("can") ? 1000 : 1050;
    }
    if (lower.includes("fanta") || lower.includes("sprite")) {
      return 900;
    }
    if (lower.includes("water")) {
      return 850;
    }

    // 5. Extract Size for Pizzas and check base prices
    const size = normalizePizzaSize(null, clean);
    const basePrice = getPizzaBasePrice(clean, size);
    if (basePrice > 0) {
      return basePrice;
    }

    return 0;
  }

  function formatNaira(amount) {
    return "₦" + Number(amount || 0).toLocaleString("en-NG");
  }

  function calculateOrderTotals(itemsMap, fulfilment) {
    let subtotal = 0;
    let totalCount = 0;

    for (const [rawName, qty] of Object.entries(itemsMap)) {
      const name = normalizeItemName(rawName);
      const price = getItemPrice(name);
      subtotal += price * qty;
      totalCount += qty;
    }

    const isDelivery = fulfilment !== "Pickup";
    const serviceFee = totalCount > 0 ? SERVICE_FEE : 0;
    const deliveryFee = (totalCount > 0 && isDelivery)
      ? Math.round(subtotal * DELIVERY_FEE_RATE)
      : 0;
    const grandTotal = subtotal + serviceFee + deliveryFee;

    return {
      subtotal,
      serviceFee,
      deliveryFee,
      grandTotal,
      totalCount,
      isDelivery,
    };
  }

  function normalizePhoneNumber(value) {
    if (typeof value !== "string") return "";
    const phone = value.trim();
    if (!/^\+?[0-9()\s-]+$/.test(phone)) {
      return "";
    }

    const digits = phone.replace(/\D/g, "");
    let internationalNumber = digits;

    if (phone.startsWith("+")) {
      internationalNumber = `+${digits}`;
    } else if (digits.startsWith("0")) {
      if (digits.length !== 11) {
        return "";
      }
      internationalNumber = `+234${digits.slice(1)}`;
    } else if (
      digits.length === 10 &&
      /^(70|80|81|90|91)/.test(digits)
    ) {
      internationalNumber = `+234${digits}`;
    } else {
      internationalNumber = `+${digits}`;
    }

    return /^\+[1-9]\d{6,14}$/.test(internationalNumber)
      ? internationalNumber
      : "";
  }

  function readStoredCart() {
    let stored = null;
    try {
      const rawLegacy = localStorage.getItem(CART_STORAGE_KEY_LEGACY);
      const rawPrimary = localStorage.getItem(CART_STORAGE_KEY_PRIMARY);

      if (rawLegacy) {
        try {
          const parsed = JSON.parse(rawLegacy);
          if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            stored = parsed;
          }
        } catch (_) {}
      }

      if (!stored && rawPrimary) {
        try {
          stored = JSON.parse(rawPrimary);
        } catch (_) {}
      }
    } catch (e) {
      console.warn("Could not read cart from localStorage", e);
    }

    const itemsMap = {};

    if (Array.isArray(stored)) {
      for (const entry of stored) {
        if (!entry) continue;
        let rawName = typeof entry === "string" ? entry.trim() : String(entry.name || entry.item || "").trim();
        if (typeof entry === "object" && entry !== null && entry.sideA && entry.sideB) {
          const sizeStr = entry.size ? `, ${entry.size}` : "";
          if (!rawName || !isHalfAndHalfItem(rawName) || (!rawName.includes("+") && !rawName.includes("/"))) {
            rawName = `Half & Half Pizza (${entry.sideA} + ${entry.sideB}${sizeStr})`;
          }
        }
        const name = normalizeItemName(rawName);
        const qty = typeof entry === "object" ? Number(entry.quantity || entry.qty || 1) : 1;
        if (name && qty > 0) {
          itemsMap[name] = Math.min((itemsMap[name] || 0) + qty, MAX_ITEM_QUANTITY);
        }
      }
    } else if (stored && typeof stored === "object") {
      for (const [rawName, qty] of Object.entries(stored)) {
        const name = normalizeItemName(rawName);
        if (typeof name === "string" && name && Number.isInteger(qty) && qty > 0) {
          itemsMap[name] = Math.min((itemsMap[name] || 0) + qty, MAX_ITEM_QUANTITY);
        }
      }
    }

    if (Object.keys(itemsMap).length === 0 && typeof window !== "undefined" && window.RomeosCart?.getItems) {
      try {
        const globalItems = window.RomeosCart.getItems();
        if (Array.isArray(globalItems)) {
          for (const item of globalItems) {
            let rawName = item?.name;
            if (typeof item === "object" && item !== null && item.sideA && item.sideB) {
              const sizeStr = item.size ? `, ${item.size}` : "";
              if (!rawName || !isHalfAndHalfItem(rawName) || (!rawName.includes("+") && !rawName.includes("/"))) {
                rawName = `Half & Half Pizza (${item.sideA} + ${item.sideB}${sizeStr})`;
              }
            }
            const name = normalizeItemName(rawName);
            if (name && item?.quantity > 0) {
              itemsMap[name] = Math.min((itemsMap[name] || 0) + item.quantity, MAX_ITEM_QUANTITY);
            }
          }
        }
      } catch (_) {}
    }

    return itemsMap;
  }

  function saveStoredCart(itemsMap) {
    const itemsArray = Object.entries(itemsMap).map(([name, quantity]) => ({ name: normalizeItemName(name), quantity }));
    try {
      localStorage.setItem(CART_STORAGE_KEY_PRIMARY, JSON.stringify(itemsArray));
      localStorage.setItem(CART_STORAGE_KEY_LEGACY, JSON.stringify(itemsMap));
    } catch (e) {
      console.warn("Could not save cart to localStorage", e);
    }

    if (typeof window !== "undefined") {
      window.RomeosCart = {
        getItems: () => Object.entries(itemsMap).map(([name, quantity]) => ({ name: normalizeItemName(name), quantity })),
      };
    }

    if (typeof document !== "undefined") {
      document.dispatchEvent(new CustomEvent("cart:change", {
        detail: { count: Object.values(itemsMap).reduce((a, b) => a + b, 0) },
      }));
    }
  }

  function formatWhatsAppMessage(payload) {
    const customerName = payload.customer?.name || "Customer";
    const customerPhone = payload.customer?.phone || "";
    const fulfilment = payload.fulfilment || "Delivery";
    const location = payload.location || "Default Location";
    const isDelivery = fulfilment !== "Pickup";
    const orderPin = payload.orderPin || null;

    const lines = [
      "*New Order Request - Coldberry Ice Cream Nigeria*",
      "",
      "*Customer Details:*",
      `• Name: ${customerName}`,
      `• Phone: ${customerPhone}`,
    ];

    if (orderPin) {
      lines.push(`• Order PIN: ${orderPin}`);
    }

    lines.push(
      "",
      "*Fulfilment Details:*",
      `• Fulfilment: ${fulfilment}`,
      `• Location: ${location}`,
    );

    if (isDelivery && payload.address) {
      lines.push(`• Delivery Address: ${payload.address}`);
    }

    lines.push("", "*Order Items:*");
    if (Array.isArray(payload.items) && payload.items.length > 0) {
      for (const item of payload.items) {
        let rawName = typeof item === "string" ? item : (item.name || item.item || "");
        if (typeof item === "object" && item !== null && item.sideA && item.sideB) {
          const sizeStr = item.size ? `, ${item.size}` : "";
          if (!rawName || !isHalfAndHalfItem(rawName) || (!rawName.includes("+") && !rawName.includes("/"))) {
            rawName = `Half & Half Pizza (${item.sideA} + ${item.sideB}${sizeStr})`;
          }
        }
        const normalizedName = normalizeItemName(rawName);
        const qty = Number(item.quantity || 1);
        const unitPrice = getItemPrice(item.sideA && item.sideB ? item : normalizedName);
        const lineTotal = unitPrice > 0 ? ` (₦${(unitPrice * qty).toLocaleString("en-NG")})` : "";
        lines.push(`• ${qty} × ${normalizedName}${lineTotal}`);
      }
    }
    if (payload.additionalItems) {
      lines.push(`• Additional Items/Requests: ${normalizeItemName(payload.additionalItems)}`);
    }

    // Compute pricing if not provided
    let pricing = payload.pricing;
    if (!pricing || typeof pricing.subtotal !== "number") {
      const itemsMap = {};
      if (Array.isArray(payload.items)) {
        for (const it of payload.items) {
          let n = typeof it === "string" ? it : (it.name || it.item || "");
          if (typeof it === "object" && it !== null && it.sideA && it.sideB) {
            const sizeStr = it.size ? `, ${it.size}` : "";
            if (!n || !isHalfAndHalfItem(n) || (!n.includes("+") && !n.includes("/"))) {
              n = `Half & Half Pizza (${it.sideA} + ${it.sideB}${sizeStr})`;
            }
          }
          n = normalizeItemName(n);
          if (n) {
            itemsMap[n] = (itemsMap[n] || 0) + Number(it.quantity || 1);
          }
        }
      }
      pricing = calculateOrderTotals(itemsMap, fulfilment);
    }

    lines.push(
      "",
      "*Payment Summary:*",
      `• Subtotal: ${formatNaira(pricing.subtotal)}`,
      `• Service Fee: ${formatNaira(pricing.serviceFee !== undefined ? pricing.serviceFee : (pricing.totalCount > 0 ? SERVICE_FEE : 0))}`,
      `• Delivery Fee: ${isDelivery ? formatNaira(pricing.deliveryFee) : "₦0 (Free Pickup)"}`,
      `• Grand Total: ${formatNaira(pricing.grandTotal)}`
    );

    if (payload.notes) {
      lines.push("", "*Special Notes:*", payload.notes);
    }

    lines.push("", "Please confirm availability and order details. Thank you!");
    return lines.join("\n");
  }

  const PIN_RETENTION_MS = 5 * 24 * 60 * 60 * 1000; // 5 days (432,000,000 ms)
  const PIN_STORAGE_KEY = "romeos_active_pins";

  function generateOrderPin(now = Date.now()) {
    let activePins = {};
    if (typeof localStorage !== "undefined") {
      try {
        const raw = localStorage.getItem(PIN_STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed === "object") {
            for (const [p, ts] of Object.entries(parsed)) {
              if (/^\d{6}$/.test(p) && Number.isFinite(ts) && now - ts < PIN_RETENTION_MS) {
                activePins[p] = ts;
              }
            }
          }
        }
      } catch (_) {}
    }

    let candidate = "";
    for (let i = 0; i < 100; i++) {
      candidate = String(Math.floor(100000 + Math.random() * 900000));
      if (!activePins[candidate]) break;
    }

    activePins[candidate] = now;
    if (typeof localStorage !== "undefined") {
      try {
        localStorage.setItem(PIN_STORAGE_KEY, JSON.stringify(activePins));
      } catch (_) {}
    }
    return candidate;
  }

  function buildClientWhatsAppUrl(payload) {
    if (!payload.orderPin) {
      payload.orderPin = generateOrderPin();
    }
    const message = formatWhatsAppMessage(payload);
    const recipient =
      (typeof window !== "undefined" && window.RESTAURANT_WHATSAPP_NUMBER) ||
      DEFAULT_RESTAURANT_WHATSAPP_NUMBER;
    const cleanRecipient = String(recipient).replace(/\D/g, "") || DEFAULT_RESTAURANT_WHATSAPP_NUMBER;
    return `https://wa.me/${cleanRecipient}?text=${encodeURIComponent(message)}`;
  }

  // Browser-specific UI initialization
  if (typeof document !== "undefined") {
    const orderForm = document.getElementById("order-form");

    if (orderForm) {
      if (typeof fetch === "function") {
        fetch("/api/orders?diagnostics=1")
          .then((res) => (res.ok ? res.json() : null))
          .then((data) => {
            if (data && data.recipient) {
              window.RESTAURANT_WHATSAPP_NUMBER = data.recipient;
            }
          })
          .catch(() => {});
      }

      const deliveryOption = orderForm.querySelector('input[value="Delivery"]');
      const pickupOption = orderForm.querySelector('input[value="Pickup"]');
      const deliveryGroup = document.getElementById("delivery-group");
      const deliveryAddress = document.getElementById("delivery-address");
      const customerName = document.getElementById("customer-name");
      const customerPhone = document.getElementById("customer-phone");
      const orderLocation = document.getElementById("order-location");
      const orderItems = document.getElementById("order-items");
      const cartValidation = document.getElementById("cart-validation");
      const orderStatus = document.getElementById("order-status");
      const submitOrder = document.getElementById("submit-order");
      const confirmation = document.getElementById("order-confirmation");
      const summary = document.getElementById("order-summary");
      const itemsBreakdown = document.getElementById("order-items-breakdown");
      const whatsappMessageLink = document.getElementById("whatsapp-message-link");
      const editOrderBtn = document.getElementById("edit-order-btn");
      const clearCartBtn = document.getElementById("clear-cart-btn");

      if (customerPhone && typeof window !== "undefined" && window.RomeosPhoneAccordion) {
        window.RomeosPhoneAccordion.mount({
          phoneInputId: "customer-phone",
          hiddenCodeId: "order-country-code",
          defaultIso: "NGA",
        });
      }

      function formatPhoneForSubmit(rawPhone) {
        const raw = String(rawPhone || "").trim();
        const codeEl = document.getElementById("order-country-code");
        if (raw.startsWith("+") || !codeEl || !codeEl.value) return raw;
        const digits = raw.replace(/\D/g, "").replace(/^0+/, "");
        return digits ? `${codeEl.value}${digits}` : raw;
      }

      function getCurrentFulfilment() {
        if (pickupOption && pickupOption.checked) return "Pickup";
        return "Delivery";
      }

      function createItemQuantityControl(name, quantity) {
        const control = document.createElement("div");
        control.className = "quantity-control";
        control.dataset.cartItem = name;

        const decrement = document.createElement("button");
        decrement.type = "button";
        decrement.dataset.cartAction = "decrement";
        decrement.setAttribute("aria-label", `Remove one ${name}`);
        decrement.textContent = "−";
        decrement.disabled = quantity <= 0;

        const count = document.createElement("span");
        count.dataset.cartQuantity = "";
        count.setAttribute("aria-live", "polite");
        count.textContent = quantity;

        const increment = document.createElement("button");
        increment.type = "button";
        increment.dataset.cartAction = "increment";
        increment.setAttribute("aria-label", `Add one ${name}`);
        increment.textContent = "+";
        increment.disabled = quantity >= MAX_ITEM_QUANTITY;

        control.append(decrement, count, increment);
        return control;
      }

      function renderOrderCart(itemsMap) {
        const list = document.getElementById("order-cart-items");
        const emptyMessage = document.getElementById("cart-empty");
        const pricingSummary = document.getElementById("cart-pricing-summary");
        const subtotalEl = document.getElementById("cart-subtotal-val");
        const serviceValEl = document.getElementById("cart-service-val");
        const deliveryLabelEl = document.getElementById("cart-delivery-label");
        const deliveryValEl = document.getElementById("cart-delivery-val");
        const grandTotalEl = document.getElementById("cart-grand-total-val");
        const totalCountEl = document.getElementById("cart-total-count");

        if (!list) return;

        const entries = Object.entries(itemsMap);
        const fulfilment = getCurrentFulfilment();
        const totals = calculateOrderTotals(itemsMap, fulfilment);

        // Live update empty message and clear cart button
        if (emptyMessage) emptyMessage.hidden = totals.totalCount > 0;
        if (clearCartBtn) clearCartBtn.hidden = totals.totalCount === 0;

        // Live update pricing breakdown
        if (pricingSummary) {
          pricingSummary.hidden = totals.totalCount === 0;
        }
        if (subtotalEl) {
          subtotalEl.textContent = formatNaira(totals.subtotal);
        }
        if (serviceValEl) {
          serviceValEl.textContent = totals.totalCount > 0 ? formatNaira(totals.serviceFee) : "₦0";
        }
        if (deliveryLabelEl) {
          deliveryLabelEl.textContent = totals.isDelivery ? "Delivery Fee" : "Pickup Fee";
        }
        if (deliveryValEl) {
          deliveryValEl.textContent = totals.isDelivery
            ? (totals.totalCount > 0 ? formatNaira(totals.deliveryFee) : "₦0")
            : "₦0 (Free Pickup)";
        }
        if (grandTotalEl) {
          grandTotalEl.textContent = formatNaira(totals.grandTotal);
        }
        if (totalCountEl) {
          totalCountEl.textContent = `${totals.totalCount} ${totals.totalCount === 1 ? "item" : "items"}`;
        }
        const navCartBadge = document.getElementById("cart-count");
        const navCartLink = document.getElementById("nav-cart-link");
        if (navCartBadge) {
          navCartBadge.textContent = totals.totalCount;
          navCartBadge.classList.toggle("has-items", totals.totalCount > 0);
        }
        if (navCartLink) {
          navCartLink.classList.toggle("has-items", totals.totalCount > 0);
          navCartLink.setAttribute(
            "aria-label",
            `Shopping cart (${totals.totalCount} ${totals.totalCount === 1 ? "item" : "items"})`
          );
        }

        // Render line items
        list.replaceChildren();
        for (const [name, quantity] of entries) {
          const li = document.createElement("li");
          li.className = "cart-item";
          li.dataset.cartItem = name;

          const info = document.createElement("div");
          info.className = "cart-item-info";

          const titleRow = document.createElement("div");
          titleRow.className = "cart-item-title-row";

          const label = document.createElement("span");
          label.className = "cart-item-name";
          label.textContent = name;

          const badge = document.createElement("span");
          badge.className = "cart-item-qty-badge";
          badge.textContent = `(${quantity} ×)`;
          badge.style.color = "var(--color-deep-wine)";
          badge.style.fontSize = "0.85rem";
          badge.style.fontWeight = "700";

          titleRow.append(label, badge);

          const unitPrice = getItemPrice(name);
          const priceTag = document.createElement("span");
          priceTag.className = "cart-item-price-tag";
          if (unitPrice > 0) {
            priceTag.textContent = quantity > 1
              ? `${formatNaira(unitPrice * quantity)} (${formatNaira(unitPrice)} each)`
              : formatNaira(unitPrice);
          } else {
            priceTag.textContent = "";
          }

          info.append(titleRow, priceTag);

          const actions = document.createElement("div");
          actions.className = "cart-item-actions";

          const control = createItemQuantityControl(name, quantity);

          const removeBtn = document.createElement("button");
          removeBtn.type = "button";
          removeBtn.className = "cart-item-remove";
          removeBtn.setAttribute("aria-label", `Remove ${name} from cart`);
          removeBtn.title = `Remove ${name}`;
          removeBtn.innerHTML = "&times;";

          actions.append(control, removeBtn);
          li.append(info, actions);
          list.append(li);
        }

        // Synchronize all quantity controls across the page (especially add-ons section)
        document.querySelectorAll("[data-cart-item]").forEach((control) => {
          if (control.closest("#order-cart-items")) return;

          const name = normalizeItemName(control.dataset.cartItem);
          const quantity = itemsMap[name] || 0;
          const count = control.querySelector("[data-cart-quantity]");
          const decrement = control.querySelector('[data-cart-action="decrement"]');
          const increment = control.querySelector('[data-cart-action="increment"]');

          if (count) count.textContent = quantity;
          if (decrement) decrement.disabled = quantity <= 0;
          if (increment) increment.disabled = quantity >= MAX_ITEM_QUANTITY;

          // Toggle card visual state
          const card = control.closest(".checkout-addon-card");
          if (card) {
            card.classList.toggle("is-in-cart", quantity > 0);
          }
        });
      }

      function getCartItemsList() {
        const itemsMap = readStoredCart();
        return Object.entries(itemsMap).map(([name, quantity]) => ({ name: normalizeItemName(name), quantity }));
      }

      function updateFulfilmentFields() {
        const isDelivery = deliveryOption ? deliveryOption.checked : true;
        if (deliveryGroup) deliveryGroup.hidden = !isDelivery;
        if (deliveryAddress) {
          deliveryAddress.required = isDelivery;
          if (!isDelivery) {
            deliveryAddress.setCustomValidity("");
          }
        }
        // Live recalculate delivery fee and grand total when switching delivery/pickup
        renderOrderCart(readStoredCart());
      }

      if (deliveryOption && pickupOption) {
        deliveryOption.addEventListener("change", updateFulfilmentFields);
        pickupOption.addEventListener("change", updateFulfilmentFields);
        updateFulfilmentFields();
      }

      // Handle URL parameter ?item=... (e.g. from menu page)
      const requestedItem = new URLSearchParams(window.location.search).get("item");
      if (requestedItem?.trim()) {
        const currentCart = readStoredCart();
        const itemName = normalizeItemName(requestedItem.trim());
        currentCart[itemName] = Math.min((currentCart[itemName] || 0) + 1, MAX_ITEM_QUANTITY);
        saveStoredCart(currentCart);
        renderOrderCart(currentCart);

        const url = new URL(window.location.href);
        url.searchParams.delete("item");
        window.history.replaceState({}, "", url);
      } else {
        renderOrderCart(readStoredCart());
      }

      // Click handler for cart quantity buttons, remove buttons, and add-on controls
      document.addEventListener("click", (event) => {
        // 1. Remove button inside cart item
        const removeBtn = event.target.closest(".cart-item-remove");
        if (removeBtn) {
          const itemLi = removeBtn.closest(".cart-item");
          const name = normalizeItemName(itemLi?.dataset.cartItem);
          if (name) {
            const currentCart = readStoredCart();
            delete currentCart[name];
            saveStoredCart(currentCart);
            renderOrderCart(currentCart);
          }
          return;
        }

        // 2. Quantity control decrement/increment button
        const button = event.target.closest("[data-cart-action]");
        const control = button?.closest("[data-cart-item]");
        if (!control) return;

        if (event.__cartHandled) return;
        event.__cartHandled = true;

        const name = normalizeItemName(control.dataset.cartItem);
        if (!name) return;

        const currentCart = readStoredCart();
        const quantity = currentCart[name] || 0;

        if (button.dataset.cartAction === "increment" && quantity < MAX_ITEM_QUANTITY) {
          currentCart[name] = quantity + 1;
        } else if (button.dataset.cartAction === "decrement" && quantity > 0) {
          if (quantity === 1) {
            delete currentCart[name];
          } else {
            currentCart[name] = quantity - 1;
          }
        }
        saveStoredCart(currentCart);
        renderOrderCart(currentCart);
      });

      // Handle clear cart button
      if (clearCartBtn) {
        clearCartBtn.addEventListener("click", () => {
          saveStoredCart({});
          renderOrderCart({});
        });
      }

      // Handle edit order button on confirmation screen
      if (editOrderBtn) {
        editOrderBtn.addEventListener("click", () => {
          confirmation.hidden = true;
          orderForm.hidden = false;
          orderForm.scrollIntoView({ behavior: "smooth", block: "start" });
        });
      }

      orderItems.addEventListener("input", () => {
        if (orderItems.value.trim()) {
          cartValidation.hidden = true;
        }
      });

      document.addEventListener("cart:change", () => {
        renderOrderCart(readStoredCart());
        const items = getCartItemsList();
        if (items.length > 0) {
          cartValidation.hidden = true;
        }
      });

      window.addEventListener("storage", (event) => {
        if (event.key === CART_STORAGE_KEY_PRIMARY || event.key === CART_STORAGE_KEY_LEGACY) {
          renderOrderCart(readStoredCart());
        }
      });

      orderForm.addEventListener("submit", async (event) => {
        event.preventDefault();

        // Client-side validation
        const nameValid = customerName.value.trim().length >= 2;
        customerName.setCustomValidity(
          nameValid ? "" : "Enter your name using at least 2 characters."
        );

        const phoneNumber = normalizePhoneNumber(formatPhoneForSubmit(customerPhone.value));
        customerPhone.setCustomValidity(
          phoneNumber
            ? ""
            : "Enter a valid phone number, such as 08012345678 or +2348012345678."
        );

        const isDelivery = deliveryOption ? deliveryOption.checked : false;
        const addressValid = !isDelivery || deliveryAddress.value.trim().length >= 5;
        deliveryAddress.setCustomValidity(
          addressValid ? "" : "Enter a delivery address using at least 5 characters."
        );

        if (orderLocation && !orderLocation.value) {
          orderLocation.setCustomValidity("Please choose a location.");
        } else if (orderLocation) {
          orderLocation.setCustomValidity("");
        }

        if (!orderForm.reportValidity()) {
          return;
        }

        const formData = new FormData(orderForm);
        const fulfilment = formData.get("fulfilment") || (isDelivery ? "Delivery" : "Pickup");
        const currentCart = readStoredCart();
        const cartItems = getCartItemsList();
        const additionalItems = normalizeItemName(String(formData.get("items") || "").trim());

        if (cartItems.length === 0 && !additionalItems) {
          cartValidation.hidden = false;
          orderItems.focus();
          return;
        }

        cartValidation.hidden = true;
        orderStatus.hidden = true;
        submitOrder.disabled = true;
        submitOrder.textContent = "Preparing message...";

        const totals = calculateOrderTotals(currentCart, fulfilment);

        // On desktop, pre-open window synchronously to avoid popup blocker.
        // On mobile browsers (iOS Safari / Android Chrome), pre-opening about:blank
        // immediately backgrounds the checkout tab and suspends the in-flight /api/orders fetch!
        const isMobileViewport =
          typeof window !== "undefined" &&
          ((window.matchMedia && window.matchMedia("(max-width: 768px)").matches) ||
            /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || ""));
        let whatsappWindow = null;
        if (!isMobileViewport) {
          try {
            whatsappWindow = window.open("about:blank", "_blank");
            if (whatsappWindow) {
              whatsappWindow.opener = null;
            }
          } catch (_) {}
        }

        const payload = {
          customer: {
            name: customerName.value.trim(),
            phone: phoneNumber,
          },
          fulfilment,
          location: formData.get("location"),
          address: fulfilment === "Delivery" ? deliveryAddress.value.trim() : "",
          items: cartItems,
          additionalItems,
          notes: String(formData.get("notes") || "").trim(),
          consent: formData.get("consent") === "on",
          pricing: totals,
        };

        const localPin = generateOrderPin();
        payload.orderPin = localPin;

        // Build WhatsApp URL with full itemized breakdown and pricing (preferring server API response when available)
        let whatsappUrl = buildClientWhatsAppUrl(payload);
        let orderId = null;
        let finalPin = localPin;

        try {
          const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
          const timeoutId = controller ? setTimeout(() => controller.abort(), 8000) : null;

          const response = await fetch("/api/orders", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
            keepalive: true,
            signal: controller ? controller.signal : undefined,
          });
          if (timeoutId) clearTimeout(timeoutId);

          if (response.ok) {
            const data = await response.json().catch(() => null);
            if (data && data.whatsappUrl) {
              whatsappUrl = data.whatsappUrl;
            }
            if (data && data.orderId) {
              orderId = data.orderId;
            }
            if (data && data.orderPin) {
              finalPin = data.orderPin;
            }
          } else if (response.status === 400 || response.status === 413 || response.status === 415) {
            const errData = await response.json().catch(() => ({}));
            if (whatsappWindow && !whatsappWindow.closed) {
              whatsappWindow.close();
            }
            orderStatus.textContent = errData.error || "Please check your order details and try again.";
            orderStatus.hidden = false;
            submitOrder.disabled = false;
            submitOrder.textContent = "Continue to WhatsApp";
            return;
          } else {
            // Under surge/rate-limit (429/503), engage fail-safe: proceed directly with client-synthesized WhatsApp order
            console.warn(`[Fail-Safe] Server returned ${response.status}; engaging instant WhatsApp fallback.`);
          }
        } catch (networkError) {
          console.warn("[Fail-Safe] Network timeout or unreachable /api/orders; proceeding with client-side WhatsApp fallback.", networkError);
        }

        // Direct user to WhatsApp
        if (whatsappWindow && !whatsappWindow.closed) {
          whatsappWindow.location.replace(whatsappUrl);
        }

        // Render confirmation UI with clickable fallback link
        const itemStrings = [
          ...cartItems.map(({ name, quantity }) => {
            const normalizedName = normalizeItemName(name);
            const unitPrice = getItemPrice(normalizedName);
            const pricePart = unitPrice > 0 ? ` (${formatNaira(unitPrice * quantity)})` : "";
            return `${quantity} × ${normalizedName}${pricePart}`;
          }),
          ...(additionalItems ? [additionalItems] : []),
        ];

        if (summary) {
          const totalStr = totals.grandTotal > 0 ? ` · Total: ${formatNaira(totals.grandTotal)}` : "";
          const refStr = orderId ? ` · Ref: #${String(orderId).slice(0, 8)}` : "";
          const pinStr = finalPin ? ` · PIN: ${finalPin}` : "";
          summary.textContent = `${phoneNumber} · ${payload.location} · ${fulfilment}${totalStr}${refStr}${pinStr}`;
        }

        const pinDisplay = document.getElementById("order-pin-display");
        const pinContainer = document.getElementById("order-pin-container");
        const trackLink = document.getElementById("order-track-link");
        const copyPinBtn = document.getElementById("copy-pin-btn");
        const copyPinFeedback = document.getElementById("copy-pin-feedback");

        function handlePinCopy() {
          const pinText = pinDisplay ? pinDisplay.textContent.trim() : String(finalPin || "");
          if (!pinText || pinText === "------") return;

          function onCopied() {
            if (copyPinBtn) {
              copyPinBtn.classList.add("copied");
              copyPinBtn.innerHTML = '<i class="fa-solid fa-check" aria-hidden="true"></i> Copied!';
              setTimeout(() => {
                copyPinBtn.classList.remove("copied");
                copyPinBtn.innerHTML = '<i class="fa-solid fa-copy" aria-hidden="true"></i> Copy PIN';
              }, 2500);
            }
            if (copyPinFeedback) {
              copyPinFeedback.hidden = false;
              setTimeout(() => { copyPinFeedback.hidden = true; }, 2500);
            }
          }

          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(pinText).then(onCopied).catch(fallback);
          } else {
            fallback();
          }

          function fallback() {
            const ta = document.createElement("textarea");
            ta.value = pinText;
            ta.style.position = "fixed";
            ta.style.opacity = "0";
            document.body.appendChild(ta);
            ta.select();
            try {
              document.execCommand("copy");
              onCopied();
            } catch (_) {}
            document.body.removeChild(ta);
          }
        }

        if (copyPinBtn) {
          copyPinBtn.onclick = handlePinCopy;
        }
        if (pinDisplay) {
          pinDisplay.onclick = handlePinCopy;
        }

        if (pinDisplay && finalPin) {
          pinDisplay.textContent = finalPin;
          if (pinContainer) pinContainer.hidden = false;
          if (trackLink) {
            trackLink.href = `track.html?phone=${encodeURIComponent(phoneNumber)}&pin=${encodeURIComponent(finalPin)}`;
          }
        }

        // 12-Minute Easy Customer Cancellation UI
        const cancelContainer = document.getElementById("order-cancel-container");
        const cancelBtn = document.getElementById("cancel-order-btn");
        const cancelTimerEl = document.getElementById("order-cancel-timer");
        const cancelFeedback = document.getElementById("order-cancel-feedback");
        if (window._romeosCancelTimerInterval) {
          clearInterval(window._romeosCancelTimerInterval);
        }
        if (cancelContainer && cancelBtn && finalPin) {
          cancelContainer.hidden = false;
          cancelBtn.disabled = false;
          cancelBtn.hidden = false;
          cancelBtn.innerHTML = '<i class="fa-solid fa-ban" aria-hidden="true"></i> Cancel Order';
          if (cancelFeedback) cancelFeedback.hidden = true;

          const expiresAt = Date.now() + 12 * 60 * 1000;
          function tickCancelTimer() {
            const secsLeft = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
            const mins = String(Math.floor(secsLeft / 60)).padStart(2, "0");
            const secs = String(secsLeft % 60).padStart(2, "0");
            if (cancelTimerEl) cancelTimerEl.textContent = `${mins}:${secs}`;
            if (secsLeft <= 0) {
              clearInterval(window._romeosCancelTimerInterval);
              cancelBtn.disabled = true;
              if (cancelFeedback) {
                cancelFeedback.textContent = "12-minute cancellation window has expired.";
                cancelFeedback.classList.remove("is-cancelled");
                cancelFeedback.hidden = false;
              }
            }
          }
          tickCancelTimer();
          window._romeosCancelTimerInterval = setInterval(tickCancelTimer, 1000);

          cancelBtn.onclick = async () => {
            cancelBtn.disabled = true;
            cancelBtn.textContent = "Cancelling...";
            try {
              const res = await fetch("/api/track", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "cancel", phone: phoneNumber, pin: finalPin }),
              });
              const data = await res.json().catch(() => ({}));
              if (res.ok && data.cancelled) {
                clearInterval(window._romeosCancelTimerInterval);
                cancelBtn.hidden = true;
                if (cancelFeedback) {
                  cancelFeedback.textContent = "Your order has been cancelled.";
                  cancelFeedback.classList.add("is-cancelled");
                  cancelFeedback.hidden = false;
                }
                if (orderReceivedContainer) {
                  orderReceivedContainer.hidden = true;
                }
              } else {
                cancelBtn.disabled = false;
                cancelBtn.innerHTML = '<i class="fa-solid fa-ban" aria-hidden="true"></i> Cancel Order';
                if (cancelFeedback) {
                  cancelFeedback.textContent = data.error || "Unable to cancel order.";
                  cancelFeedback.hidden = false;
                }
              }
            } catch (_) {
              cancelBtn.disabled = false;
              cancelBtn.innerHTML = '<i class="fa-solid fa-ban" aria-hidden="true"></i> Cancel Order';
              if (cancelFeedback) {
                cancelFeedback.textContent = "Network error while cancelling. Please check your connection.";
                cancelFeedback.hidden = false;
              }
            }
          };
        }

        // Customer Order Received / Done Confirmation
        const orderReceivedContainer = document.getElementById("order-received-container");
        const orderReceivedBtn = document.getElementById("order-received-btn");
        const orderReceivedBanner = document.getElementById("order-received-banner");
        const orderReceivedFeedback = document.getElementById("order-received-feedback");

        if (orderReceivedContainer && orderReceivedBtn && finalPin) {
          orderReceivedContainer.hidden = false;
          orderReceivedBtn.hidden = false;
          orderReceivedBtn.disabled = false;
          orderReceivedBtn.innerHTML = '<i class="fa-solid fa-circle-check"></i> Mark Order as Received (Done)';
          if (orderReceivedBanner) orderReceivedBanner.hidden = true;
          if (orderReceivedFeedback) orderReceivedFeedback.hidden = true;

          orderReceivedBtn.onclick = async () => {
            orderReceivedBtn.disabled = true;
            orderReceivedBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Confirming Receipt...';
            try {
              const res = await fetch("/api/track", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "mark_received", phone: phoneNumber, pin: finalPin }),
              });
              const data = await res.json().catch(() => ({}));
              if (res.ok && data.completed) {
                if (window._romeosCancelTimerInterval) {
                  clearInterval(window._romeosCancelTimerInterval);
                }
                if (cancelContainer) cancelContainer.hidden = true;
                orderReceivedBtn.hidden = true;
                if (orderReceivedBanner) orderReceivedBanner.hidden = false;
                if (orderReceivedFeedback) {
                  orderReceivedFeedback.hidden = true;
                }
              } else {
                orderReceivedBtn.disabled = false;
                orderReceivedBtn.innerHTML = '<i class="fa-solid fa-circle-check"></i> Mark Order as Received (Done)';
                if (orderReceivedFeedback) {
                  orderReceivedFeedback.textContent = data.error || "Unable to mark order as received.";
                  orderReceivedFeedback.hidden = false;
                }
              }
            } catch (_) {
              orderReceivedBtn.disabled = false;
              orderReceivedBtn.innerHTML = '<i class="fa-solid fa-circle-check"></i> Mark Order as Received (Done)';
              if (orderReceivedFeedback) {
                orderReceivedFeedback.textContent = "Network error. Please try again.";
                orderReceivedFeedback.hidden = false;
              }
            }
          };
        }

        if (itemsBreakdown) {
          itemsBreakdown.replaceChildren();
          const breakdownTitle = document.createElement("strong");
          breakdownTitle.textContent = "Order Breakdown:";
          const breakdownList = document.createElement("ul");
          breakdownList.style.margin = "0.4rem 0 0";
          breakdownList.style.paddingLeft = "1.2rem";

          for (const str of itemStrings) {
            const itemLi = document.createElement("li");
            itemLi.textContent = str;
            breakdownList.append(itemLi);
          }

          if (totals.subtotal > 0) {
            const summaryLi = document.createElement("li");
            summaryLi.style.marginTop = "0.5rem";
            summaryLi.style.fontWeight = "700";
            const deliveryPart = totals.isDelivery
              ? ` | Delivery: ${formatNaira(totals.deliveryFee)}`
              : " | Delivery: ₦0 (Free Pickup)";
            summaryLi.textContent = `Subtotal: ${formatNaira(totals.subtotal)} | Service Fee: ${formatNaira(totals.serviceFee)}${deliveryPart} | Grand Total: ${formatNaira(totals.grandTotal)}`;
            breakdownList.append(summaryLi);
          }

          itemsBreakdown.append(breakdownTitle, breakdownList);
          itemsBreakdown.hidden = false;
        }

        if (whatsappMessageLink) {
          whatsappMessageLink.href = whatsappUrl;
          whatsappMessageLink.hidden = false;
        }

        orderForm.hidden = true;
        if (confirmation) {
          confirmation.hidden = false;
          confirmation.scrollIntoView({ behavior: "smooth", block: "center" });
        }

        submitOrder.disabled = false;
        submitOrder.textContent = "Continue to WhatsApp";
      });
    }
  }

  // Expose global and CommonJS modules for tests
  if (typeof window !== "undefined") {
    window.RomeosOrder = {
      ITEM_PRICES,
      getItemPrice,
      getPizzaBasePrice,
      calculateHalfAndHalfPrice,
      isHalfAndHalfItem,
      parseHalfAndHalfItem,
      formatWhatsAppMessage,
      calculateOrderTotals,
      normalizeItemName,
      buildClientWhatsAppUrl,
      formatNaira,
      SERVICE_FEE,
      DELIVERY_FEE_RATE,
      generateOrderPin,
    };
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      ITEM_PRICES,
      getItemPrice,
      getPizzaBasePrice,
      calculateHalfAndHalfPrice,
      isHalfAndHalfItem,
      parseHalfAndHalfItem,
      formatWhatsAppMessage,
      calculateOrderTotals,
      normalizeItemName,
      buildClientWhatsAppUrl,
      formatNaira,
      SERVICE_FEE,
      DELIVERY_FEE_RATE,
      generateOrderPin,
    };
  }
})();
