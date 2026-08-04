// Aguarda o carregamento completo do DOM para garantir que todos os elementos existam
document.addEventListener('DOMContentLoaded', () => {

    // --- FUNÇÕES GLOBAIS DE DADOS (LocalStorage) --- //
    // Estas funções são declaradas no escopo superior para serem acessíveis por outros scripts
    // Elas são atribuídas ao objeto window para garantir o acesso.

    const getAppData = () => {
        const data = localStorage.getItem('estoqueFacilData');
        const appData = data ? JSON.parse(data) : { orders: {}, suppliers: [], cart: [] };
        if (Object.prototype.hasOwnProperty.call(appData, 'tableStatuses')) {
            delete appData.tableStatuses;
            localStorage.setItem('estoqueFacilData', JSON.stringify(appData));
        }
        return appData;
    };
    window.getAppData = getAppData;

    const saveAppData = (data) => {
        localStorage.setItem('estoqueFacilData', JSON.stringify(data));
    };
    window.saveAppData = saveAppData;

    const requestJson = async (url, options = {}) => {
        const response = await fetch(url, options);
        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
            throw new Error(data.error || data.message || 'Erro ao acessar o servidor.');
        }

        return data;
    };

    const updateTableStatusByNumber = async (tableNumber, status) => {
        const tables = await requestJson('/api/mesas');
        const table = tables.find(item => String(item.numero).padStart(2, '0') === String(tableNumber).padStart(2, '0'));
        if (!table) throw new Error(`Mesa ${tableNumber} não encontrada.`);

        return requestJson(`/api/mesas/${table.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status })
        });
    };

    const migrateLocalOrdersToMysql = async () => {
        const appData = getAppData();
        const entries = Object.entries(appData.orders || {});
        if (entries.length === 0) return;

        for (const [tableNumber, order] of entries) {
            if (!order?.items?.length) continue;
            await requestJson(`/api/atendimento/mesas/${encodeURIComponent(tableNumber)}/pedido`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ items: order.items })
            });
        }
        delete appData.orders;
        saveAppData(appData);
    };

    const loadIngredientCatalog = async () => {
        const [units, initialIngredients] = await Promise.all([
            requestJson('/api/unidades'),
            requestJson('/api/ingredientes')
        ]);
        const unitsById = new Map(units.map(unit => [Number(unit.id), unit]));
        const legacyData = getAppData();
        const legacyIngredients = legacyData.baseIngredients || [];
        let ingredients = initialIngredients;

        if (legacyIngredients.length > 0) {
            for (const legacyIngredient of legacyIngredients) {
                const unit = units.find(item =>
                    item.sigla.toLowerCase() === String(legacyIngredient.unit).toLowerCase()
                );
                const alreadyExists = ingredients.some(item =>
                    item.nome.trim().toLowerCase() === String(legacyIngredient.name).trim().toLowerCase()
                    && Number(item.unidade_id) === Number(unit?.id)
                );

                if (!unit || alreadyExists) continue;

                const createdIngredient = await requestJson('/api/ingredientes', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        nome: legacyIngredient.name,
                        unidade_id: unit.id,
                        custo_por_unidade: Number(legacyIngredient.cost) || 0,
                        ativo: 1
                    })
                });
                ingredients = [createdIngredient, ...ingredients];
            }

            delete legacyData.baseIngredients;
            saveAppData(legacyData);
        }

        return {
            units,
            ingredients: ingredients.map(ingredient => ({
                ...ingredient,
                unit: unitsById.get(Number(ingredient.unidade_id))
            }))
        };
    };

    // --- FUNÇÕES GLOBAIS DO CARRINHO (acessíveis por script_Modal.js) ---
    // Também são atribuídas ao objeto window.

    const getCart = () => {
        const appData = getAppData();
        return appData.cart || [];
    };
    window.getCart = getCart;

    const saveCart = (cart) => {
        const appData = getAppData();
        appData.cart = cart;
        saveAppData(appData);
        updateCartIconCount();
    };
    window.saveCart = saveCart;

    // --- LÓGICA DA BARRA LATERAL (SIDEBAR) ---
    // Encapsulada em função para permitir inicialização após partial ser carregado
    function initSidebar() {
        const sidebar = document.getElementById('sidebar');
        const sidebarToggle = document.getElementById('sidebar-toggle');
        const mainContent = document.getElementById('main-content');
        if (!sidebar || !sidebarToggle || !mainContent) return;

        const linkTexts = sidebar.querySelectorAll('.sidebar-link-text');

        const applySidebarState = (isExpanded) => {
            // Usamos classes e CSS para controlar largura e visibilidade; evita manipular estilos inline
            sidebar.classList.toggle('expanded', isExpanded);
            document.body.classList.toggle('sidebar-expanded', isExpanded);
            // atualiza atributo para acessibilidade
            sidebar.setAttribute('aria-expanded', String(!!isExpanded));
        };

        sidebarToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            const isCurrentlyExpanded = sidebar.classList.contains('expanded');
            const newState = !isCurrentlyExpanded;
            localStorage.setItem('sidebarState', newState ? 'expanded' : 'collapsed');
            applySidebarState(newState);
        });

        // Inicializa estado salvo
        const initialState = localStorage.getItem('sidebarState') === 'expanded';
        applySidebarState(initialState);
    }

    // --- LÓGICA PARA SINALIZAR O LINK DA PÁGINA ATUAL NA SIDEBAR ---
    function highlightCurrentPageLink() {
        const currentPage = window.location.pathname.split('/').pop().split('?')[0];
        // Se a página for a raiz (index.html), trata como dashboard.html para o highlight
        const activePage = (currentPage === '' || currentPage === 'index.html') ? 'dashboard.html' : currentPage;
        const menuItems = document.querySelectorAll('.item-menu');
        menuItems.forEach(item => {
            const itemHref = item.getAttribute('href').split('/').pop();
            if (itemHref === activePage) {
                item.classList.add('bg-orange-700', 'dark:bg-gray-700');
            }
        });
    }

    // ESVUAZIAR: Inicializa se sidebar já estiver presente (página que não usa includes)
    if (document.getElementById('sidebar')) {
        initSidebar();
        highlightCurrentPageLink();
    }

    // Inicializa quando o partial for carregado via includes.js
    document.addEventListener('partial:loaded', (ev) => {
        if (ev && ev.detail && ev.detail.name === 'sidebar') {
            initSidebar();
            highlightCurrentPageLink();
        }
    });

    // --- LÓGICA DA PÁGINA DE CADASTRO DE PRODUTOS ---
    if (!!document.getElementById('add-ingredient-form')) {
        const productPriceInput = document.getElementById('product-price');
        const totalCostInput = document.getElementById('total-cost');
        const profitMarginInput = document.getElementById('profit-margin');
        const profitMarginPercentageInput = document.getElementById('profit-margin-percentage');
        const dropzoneFileInput = document.getElementById('dropzone-file');
        const imagePreview = document.getElementById('image-preview');
        const imagePreviewPlaceholder = document.getElementById('image-preview-placeholder');
        const addIngredientForm = document.getElementById('add-ingredient-form');
        const ingredientsTableBody = document.getElementById('ingredients-table-body');
        const noIngredientsMessage = document.getElementById('no-ingredients-message');
        const ingredientsTableFooter = document.getElementById('ingredients-table-footer');
        const totalIngredientsCostCell = document.getElementById('total-ingredients-cost');
        const addIngredientModalElement = document.getElementById('add-ingredient-modal');
        const ingredientSelect = document.getElementById('ingredient-select');
        const modal = new Modal(addIngredientModalElement, {});

        dropzoneFileInput.addEventListener('change', (event) => {
            const file = event.target.files[0];
            if (file && file.type.startsWith('image/')) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    imagePreview.src = e.target.result;
                    imagePreview.classList.remove('hidden');
                    imagePreviewPlaceholder.classList.add('hidden');
                };
                reader.readAsDataURL(file);
            }
        });

        const populateIngredientsDropdown = async () => {
            ingredientSelect.innerHTML = '<option value="" disabled selected>Carregando ingredientes...</option>';

            let baseIngredients;
            try {
                ({ ingredients: baseIngredients } = await loadIngredientCatalog());
            } catch (error) {
                ingredientSelect.innerHTML = '<option value="" disabled selected>Erro ao carregar ingredientes</option>';
                alert(error.message);
                return;
            }

            ingredientSelect.innerHTML = '<option value="" disabled selected>Selecione um ingrediente</option>';
            if (baseIngredients.length === 0) {
                ingredientSelect.innerHTML = '<option value="" disabled selected>Nenhum ingrediente cadastrado</option>';
                return;
            }
            baseIngredients.forEach(ing => {
                const option = document.createElement('option');
                option.value = ing.id;
                option.textContent = `${ing.nome} (R$ ${Number(ing.custo_por_unidade).toFixed(2)} / ${ing.unit?.sigla || '-'})`;
                option.dataset.cost = ing.custo_por_unidade;
                option.dataset.unit = ing.unit?.sigla || '';
                option.dataset.name = ing.nome;
                ingredientSelect.appendChild(option);
            });
        };

        // Flowbite usa um observer, então podemos popular ao clicar no botão que abre o modal
        document.querySelector('[data-modal-toggle="add-ingredient-modal"]').addEventListener('click', populateIngredientsDropdown);

        addIngredientForm.addEventListener('submit', (event) => {
            event.preventDefault();
            const selectedOption = ingredientSelect.options[ingredientSelect.selectedIndex];
            if (!selectedOption || !selectedOption.value) {
                alert("Por favor, selecione um ingrediente válido.");
                return;
            }
            const name = selectedOption.dataset.name;
            const unit = selectedOption.dataset.unit;
            const costPerUnit = parseFloat(selectedOption.dataset.cost);
            const quantity = parseFloat(document.getElementById('recipe-ingredient-quantity').value);
            
            const totalCost = costPerUnit * quantity;

            const newRow = document.createElement('tr');
            newRow.className = 'bg-white border-b dark:bg-gray-800 dark:border-gray-700';
            newRow.setAttribute('data-total-cost', totalCost);
            newRow.innerHTML = `
                <th scope="row" class="px-6 py-4 font-medium text-gray-900 whitespace-nowrap dark:text-white">${name}</th>
                <td class="px-6 py-4">R$ ${totalCost.toFixed(2)}</td>
                <td class="px-6 py-4">${quantity.toFixed(3)}</td>
                <td class="px-6 py-4">${unit}</td>
                <td class="px-6 py-4 text-center">
                    <button type="button" class="text-red-500 hover:text-red-700 delete-ingredient-btn"><i class="bi bi-trash-fill"></i></button>
                </td>
            `;
            ingredientsTableBody.appendChild(newRow);
            updateNoIngredientsMessage();
            updateCostsAndProfit();
            addIngredientForm.reset();
            modal.hide();
        });

        ingredientsTableBody.addEventListener('click', (event) => {
            const deleteButton = event.target.closest('.delete-ingredient-btn');
            if (deleteButton) {
                deleteButton.closest('tr').remove();
                updateNoIngredientsMessage();
                updateCostsAndProfit();
            }
        });

        productPriceInput.addEventListener('input', updateCostsAndProfit);

        function updateCostsAndProfit() {
            let totalCost = 0;
            ingredientsTableBody.querySelectorAll('tr').forEach(row => {
                const rowCost = parseFloat(row.getAttribute('data-total-cost'));
                if (!isNaN(rowCost)) {
                    totalCost += rowCost;
                }
            });
            totalIngredientsCostCell.textContent = `R$ ${totalCost.toFixed(2)}`;
            totalCostInput.value = `R$ ${totalCost.toFixed(2)}`;
            const salePrice = parseFloat(productPriceInput.value);
            if (!isNaN(salePrice) && salePrice > 0) {
                const profitMargin = salePrice - totalCost;
                profitMarginInput.value = `R$ ${profitMargin.toFixed(2)}`;
                const profitPercentage = (profitMargin / salePrice) * 100;
                profitMarginPercentageInput.value = `${profitPercentage.toFixed(2)}%`;
            } else {
                profitMarginInput.value = 'R$ 0.00';
                profitMarginPercentageInput.value = '0.00%';
            }
        }

        const updateNoIngredientsMessage = () => {
            if (ingredientsTableBody.children.length === 0) {
                noIngredientsMessage.classList.remove('hidden');
                ingredientsTableFooter.classList.add('hidden');
            } else {
                noIngredientsMessage.classList.add('hidden');
                ingredientsTableFooter.classList.remove('hidden');
            }
        };
        updateNoIngredientsMessage();
        updateCostsAndProfit();

        // --- LÓGICA PARA SALVAR A RECEITA/PRODUTO ---
        const saveRecipeBtn = document.getElementById('save-recipe-btn');
        if (saveRecipeBtn) {
            const getRecipes = () => {
                const appData = getAppData();
                return appData.recipes || [];
            };

            const saveRecipes = (recipes) => {
                const appData = getAppData();
                appData.recipes = recipes;
                saveAppData(appData);
            };

            saveRecipeBtn.addEventListener('click', () => {
                const productName = document.getElementById('product-name').value;
                const productPrice = parseFloat(document.getElementById('product-price').value);
                const productDescription = document.getElementById('product-description').value;
                const productImage = document.getElementById('image-preview').src;

                if (!productName || isNaN(productPrice) || productPrice <= 0) {
                    alert('Por favor, preencha o nome e o preço de venda do produto.');
                    return;
                }

                const ingredients = [];
                ingredientsTableBody.querySelectorAll('tr').forEach(row => {
                    const cells = row.querySelectorAll('th, td');
                    ingredients.push({
                        name: cells[0].textContent,
                        totalCost: parseFloat(row.dataset.totalCost),
                        quantity: parseFloat(cells[2].textContent),
                        unit: cells[3].textContent
                    });
                });

                if (ingredients.length === 0) {
                    alert('Adicione pelo menos um ingrediente à receita.');
                    return;
                }

                const totalCostText = totalCostInput.value.replace('R$ ', '').replace(',', '.');
                const totalCost = parseFloat(totalCostText);

                const newRecipe = {
                    id: `recipe-${Date.now()}`,
                    name: productName,
                    price: productPrice,
                    description: productDescription,
                    image: (productImage && productImage.startsWith('data:image')) ? productImage : '/imagens/450x300.png', // Salva a imagem em base64 ou um placeholder
                    ingredients: ingredients,
                    totalCost: totalCost
                };

                const recipes = getRecipes();
                recipes.push(newRecipe);
                saveRecipes(recipes);

                alert('Produto salvo com sucesso!');
                window.location.href = 'cadastro_produtos.html';
            });
        }
    }

    // --- LÓGICA DA PÁGINA DE CADASTRO DE INGREDIENTES BASE ---
    if (!!document.getElementById('add-base-ingredient-form')) {
        const form = document.getElementById('add-base-ingredient-form');
        const ingredientsList = document.getElementById('base-ingredients-list');
        const noItemsMsg = document.getElementById('no-base-ingredients-msg');
        const unitSelect = document.getElementById('base-ingredient-unit');

        const renderBaseIngredients = async () => {
            ingredientsList.innerHTML = '<p class="text-center text-gray-500 mt-10">Carregando ingredientes...</p>';
            unitSelect.disabled = true;

            let units;
            let ingredients;
            try {
                ({ units, ingredients } = await loadIngredientCatalog());
            } catch (error) {
                ingredientsList.innerHTML = `<p class="text-center text-red-500 mt-10">${error.message}</p>`;
                return;
            }

            unitSelect.innerHTML = '<option value="" disabled selected>Selecione</option>';
            units.forEach(unit => {
                const option = document.createElement('option');
                option.value = unit.id;
                option.textContent = `${unit.nome} (${unit.sigla})`;
                unitSelect.appendChild(option);
            });
            unitSelect.disabled = false;

            ingredientsList.innerHTML = ''; // Limpa a lista
            
            if (ingredients.length === 0) {
                ingredientsList.appendChild(noItemsMsg);
                noItemsMsg.classList.remove('hidden');
            } else {
                noItemsMsg.classList.add('hidden');
                ingredients.forEach(ing => {
                    const itemEl = document.createElement('div');
                    itemEl.className = 'p-3 bg-gray-50 dark:bg-gray-700 rounded-md flex justify-between items-center';
                    itemEl.innerHTML = `
                        <span class="font-medium text-gray-800 dark:text-gray-200">${ing.nome}</span>
                        <div class="flex items-center gap-4">
                            <span class="text-xs text-gray-500 dark:text-gray-400">Custo: R$ ${Number(ing.custo_por_unidade).toFixed(2)} / ${ing.unit?.sigla || '-'}</span>
                            <button type="button" data-ingredient-id="${ing.id}" class="delete-base-ingredient-btn text-red-500 hover:text-red-700"><i class="bi bi-trash-fill"></i></button>
                        </div>
                    `;
                    ingredientsList.appendChild(itemEl);
                });
            }
        };

        form.addEventListener('submit', async (event) => {
            event.preventDefault();

            try {
                await requestJson('/api/ingredientes', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        nome: document.getElementById('base-ingredient-name').value.trim(),
                        unidade_id: Number(unitSelect.value),
                        custo_por_unidade: Number(document.getElementById('base-ingredient-cost').value),
                        ativo: 1
                    })
                });
                form.reset();
                await renderBaseIngredients();
            } catch (error) {
                alert(error.message);
            }
        });

        ingredientsList.addEventListener('click', async (event) => {
            const deleteButton = event.target.closest('.delete-base-ingredient-btn');
            if (!deleteButton || !confirm('Tem certeza que deseja excluir este ingrediente?')) return;

            try {
                await requestJson(`/api/ingredientes/${deleteButton.dataset.ingredientId}`, {
                    method: 'DELETE'
                });
                await renderBaseIngredients();
            } catch (error) {
                alert(error.message);
            }
        });

        renderBaseIngredients();
    }

    // --- LÓGICA DA PÁGINA DE VISUALIZAÇÃO DE PRODUTOS E INGREDIENTES ---
    if (!!document.getElementById('recipes-list')) {
        const recipesList = document.getElementById('recipes-list');
        const noRecipesMsg = document.getElementById('no-recipes-msg');
        const ingredientsList = document.getElementById('ingredients-list');
        const noIngredientsMsg = document.getElementById('no-ingredients-msg');

        const getRecipes = () => {
            const appData = getAppData();
            return appData.recipes || [];
        };

        const saveRecipes = (recipes) => {
            const appData = getAppData();
            appData.recipes = recipes;
            saveAppData(appData);
        };

        const renderRecipes = () => {
            const recipes = getRecipes();
            recipesList.innerHTML = '';
            if (recipes.length === 0) {
                noRecipesMsg.classList.remove('hidden');
            } else {
                noRecipesMsg.classList.add('hidden');
                recipes.forEach(recipe => {
                    const itemEl = document.createElement('li');
                    itemEl.className = 'p-3 bg-gray-50 dark:bg-gray-700 rounded-md flex items-center gap-4';
                    itemEl.innerHTML = `
                        <img src="${recipe.image}" alt="${recipe.name}" class="w-12 h-12 object-cover rounded-md">
                        <div class="flex-grow">
                            <span class="font-medium text-gray-800 dark:text-gray-200">${recipe.name}</span>
                            <p class="text-xs text-gray-500 dark:text-gray-400">Preço: R$ ${recipe.price.toFixed(2)}</p>
                        </div>
                        <div class="flex items-center gap-2">
                            <button type="button" data-recipe-id="${recipe.id}" class="delete-recipe-btn text-red-500 hover:text-red-700"><i class="bi bi-trash-fill"></i></button>
                        </div>
                    `;
                    recipesList.appendChild(itemEl);
                });
            }
        };

        const renderBaseIngredients = async () => {
            let ingredients;
            try {
                ({ ingredients } = await loadIngredientCatalog());
            } catch (error) {
                ingredientsList.innerHTML = `<li class="text-center text-red-500">${error.message}</li>`;
                return;
            }

            ingredientsList.innerHTML = '';
            if (ingredients.length === 0) {
                noIngredientsMsg.classList.remove('hidden');
                ingredientsList.appendChild(noIngredientsMsg);
            } else {
                noIngredientsMsg.classList.add('hidden');
                ingredients.forEach(ing => {
                    const itemEl = document.createElement('li');
                    itemEl.className = 'p-3 bg-gray-50 dark:bg-gray-700 rounded-md flex justify-between items-center';
                    itemEl.innerHTML = `
                        <span class="font-medium text-gray-800 dark:text-gray-200">${ing.nome}</span>
                        <div class="flex items-center gap-4">
                            <span class="text-xs text-gray-500 dark:text-gray-400">Custo: R$ ${Number(ing.custo_por_unidade).toFixed(2)} / ${ing.unit?.sigla || '-'}</span>
                            <button type="button" data-ingredient-id="${ing.id}" class="delete-ingredient-btn text-red-500 hover:text-red-700"><i class="bi bi-trash-fill"></i></button>
                        </div>
                    `;
                    ingredientsList.appendChild(itemEl);
                });
            }
        };

        recipesList.addEventListener('click', (event) => {
            const deleteButton = event.target.closest('.delete-recipe-btn');
            if (deleteButton) {
                if (confirm('Tem certeza que deseja excluir esta receita?')) {
                    const recipeId = deleteButton.dataset.recipeId;
                    let recipes = getRecipes();
                    recipes = recipes.filter(r => r.id !== recipeId);
                    saveRecipes(recipes);
                    renderRecipes();
                }
            }
        });

        ingredientsList.addEventListener('click', async (event) => {
            const deleteButton = event.target.closest('.delete-ingredient-btn');
            if (deleteButton) {
                if (confirm('Tem certeza que deseja excluir este ingrediente?')) {
                    try {
                        await requestJson(`/api/ingredientes/${deleteButton.dataset.ingredientId}`, {
                            method: 'DELETE'
                        });
                        await renderBaseIngredients();
                    } catch (error) {
                        alert(error.message);
                    }
                }
            }
        });

        renderRecipes();
        renderBaseIngredients();
    }
    
    // --- LÓGICA DA PÁGINA DE GESTÃO DE ESTOQUE ---
    if (!!document.getElementById('stock-table-body')) {
        const searchInput = document.getElementById('stock-search-input');
        const tableBody = document.getElementById('stock-table-body');
        const addItemForm = document.getElementById('add-item-form');
        const addItemModalElement = document.getElementById('add-item-modal');
        const modal = new Modal(addItemModalElement);

        searchInput.addEventListener('keyup', () => {
            const searchTerm = searchInput.value.toLowerCase();
            const rows = tableBody.getElementsByTagName('tr');
            Array.from(rows).forEach(row => {
                const ingredientCell = row.cells[2];
                if (ingredientCell) {
                    const ingredientText = ingredientCell.textContent.toLowerCase();
                    if (ingredientText.includes(searchTerm)) {
                        row.style.display = '';
                    } else {
                        row.style.display = 'none';
                    }
                }
            });
        });

        addItemForm.addEventListener('submit', (event) => {
            event.preventDefault();
            const code = document.getElementById('item-code').value;
            const ingredient = document.getElementById('item-ingredient').value;
            const receiptDate = document.getElementById('item-receipt-date').value;
            const stockQuantity = document.getElementById('item-stock-quantity').value;
            const formattedDate = receiptDate ? new Date(receiptDate + 'T00:00:00').toLocaleDateString('pt-BR') : 'N/A';
            const newRow = document.createElement('tr');
            newRow.className = 'bg-white border-b dark:bg-gray-800 dark:border-gray-700';
            newRow.innerHTML = `
                <td class="w-4 p-4"><input type="checkbox" class="w-4 h-4 text-orange-600 bg-gray-100 border-gray-300 rounded focus:ring-orange-500"></td>
                <td class="px-6 py-4 font-medium">${code || 'N/A'}</td>
                <td class="px-6 py-4 font-medium text-gray-900 whitespace-nowrap dark:text-white">${ingredient}</td>
                <td class="px-6 py-4">${formattedDate}</td>
                <td class="px-6 py-4">${stockQuantity || 0}</td>
                <td class="px-6 py-4">0</td>
                <td class="px-6 py-4"><span class="bg-green-100 text-green-800 text-xs font-medium me-2 px-2.5 py-0.5 rounded dark:bg-green-900 dark:text-green-300">Normal</span></td>
                <td class="px-6 py-4 text-center space-x-2">
                    <button class="text-blue-500 hover:text-blue-700 edit-btn"><i class="bi bi-pencil-fill"></i></button>
                    <button class="text-red-500 hover:text-red-700 delete-btn"><i class="bi bi-trash-fill"></i></button>
                </td>
            `;
            tableBody.appendChild(newRow);
            addItemForm.reset();
            modal.hide();
        });

        tableBody.addEventListener('click', (event) => {
            const deleteButton = event.target.closest('.delete-btn');
            if (deleteButton) {
                deleteButton.closest('tr').remove();
            }
        });
    }

    // --- LÓGICA DA PÁGINA DE ATENDIMENTO DE MESAS ---
    if (!!document.getElementById('tables-grid')) {
        const tablesGrid = document.getElementById('tables-grid');
        const addTableBtn = document.getElementById('btnM');
        const tableOptionsModalElement = document.getElementById('table-options-modal');
        const tableOptionsModal = new Modal(tableOptionsModalElement);
        const modalTableNumber = document.getElementById('modal-table-number');
        const modalTableStatus = document.getElementById('modal-table-status');
        const modalStartOrderBtn = document.getElementById('modal-start-order-btn');
        const modalEditOrderBtn = document.getElementById('modal-edit-order-btn');
        const modalChangeStatusBtn = document.getElementById('modal-change-status-btn');
        
        const changeStatusModalElement = document.getElementById('change-status-modal');
        const changeStatusModal = new Modal(changeStatusModalElement);
        const changeStatusTitle = document.getElementById('change-status-title');
        const statusOptionButtons = document.querySelectorAll('.change-status-option-btn');
        
        let selectedTableNumber = null;

        const createTableButton = (table) => {
            const number = String(table.numero).padStart(2, '0');
            const button = document.createElement('button');
            button.type = 'button';
            button.dataset.tableId = table.id;
            button.dataset.tableNumber = number;
            button.dataset.status = table.status || 'disponivel';
            button.className = 'table-button flex items-center justify-between p-4 h-24 bg-green-700 text-white rounded-lg shadow-lg hover:bg-green-800 transition-colors';
            button.innerHTML = `
                <div class="flex flex-col items-start">
                    <span class="text-sm font-medium">MESA</span>
                    <span class="text-4xl font-bold">${number}</span>
                </div>
                <span class="table-total text-xl font-semibold"></span>
            `;
            return button;
        };

        const loadTables = async () => {
            await migrateLocalOrdersToMysql();
            const [tables, openOrders] = await Promise.all([
                requestJson('/api/mesas'),
                requestJson('/api/atendimento/pedidos-abertos')
            ]);
            tablesGrid.replaceChildren(...tables
                .sort((a, b) => Number(a.numero) - Number(b.numero))
                .map(createTableButton));
            openOrders.forEach(order => {
                const number = String(order.mesa_numero).padStart(2, '0');
                const button = tablesGrid.querySelector(`[data-table-number="${number}"]`);
                if (button) button.dataset.orderTotal = Number(order.total || 0).toFixed(2);
            });
            updateTableDisplay();
            return tables;
        };

        const updateTableDisplay = () => {
            tablesGrid.querySelectorAll('.table-button').forEach(button => {
                const status = button.dataset.status || 'disponivel';
                const totalSpan = button.querySelector('.table-total');
                
                button.dataset.status = status;
                button.classList.remove('bg-green-700', 'hover:bg-green-800', 'bg-orange-700', 'hover:bg-orange-800', 'bg-blue-700', 'hover:bg-blue-800', 'bg-slate-600', 'hover:bg-slate-700');

                switch(status) {
                    case 'atendimento': button.classList.add('bg-orange-700', 'hover:bg-orange-800'); break;
                    case 'reserva': button.classList.add('bg-blue-700', 'hover:bg-blue-800'); break;
                    case 'indisponivel': button.classList.add('bg-slate-600', 'hover:bg-slate-700'); break;
                    default: button.classList.add('bg-green-700', 'hover:bg-green-800'); break;
                }

                totalSpan.textContent = button.dataset.orderTotal
                    ? `R$ ${button.dataset.orderTotal.replace('.', ',')}`
                    : '';
            });
        };

        addTableBtn?.addEventListener('click', async () => {
            addTableBtn.disabled = true;
            const originalText = addTableBtn.textContent;
            addTableBtn.textContent = 'Adicionando...';

            try {
                const tables = await requestJson('/api/mesas');
                const usedNumbers = new Set(tables.map(table => Number(table.numero)));
                let nextNumber = 1;
                while (usedNumbers.has(nextNumber)) nextNumber += 1;

                const table = await requestJson('/api/mesas', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        numero: String(nextNumber).padStart(2, '0'),
                        status: 'disponivel',
                        lugares: 4
                    })
                });

                tablesGrid.appendChild(createTableButton(table));
                updateTableDisplay();
            } catch (error) {
                alert(`Não foi possível adicionar a mesa: ${error.message}`);
            } finally {
                addTableBtn.disabled = false;
                addTableBtn.textContent = originalText;
            }
        });

        tablesGrid.addEventListener('click', (event) => {
            const tableButton = event.target.closest('.table-button');
            if (tableButton && tableButton.dataset.tableNumber) {
                selectedTableNumber = tableButton.dataset.tableNumber;
                const tableStatus = tableButton.dataset.status;
                modalTableNumber.textContent = `Mesa ${selectedTableNumber}`;
                modalStartOrderBtn.classList.add('hidden');
                modalEditOrderBtn.classList.add('hidden');
                
                switch(tableStatus) {
                    case 'disponivel':
                        modalTableStatus.textContent = 'Disponível';
                        modalTableStatus.className = 'mb-4 text-lg font-medium text-green-700';
                        modalStartOrderBtn.classList.remove('hidden');
                        break;
                    case 'atendimento':
                        modalTableStatus.textContent = 'Em Atendimento';
                        modalTableStatus.className = 'mb-4 text-lg font-medium text-orange-700';
                        modalEditOrderBtn.classList.remove('hidden');
                        break;
                    default:
                        modalTableStatus.textContent = tableStatus.charAt(0).toUpperCase() + tableStatus.slice(1);
                        modalTableStatus.className = 'mb-4 text-lg font-medium text-gray-500';
                        break;
                }
                tableOptionsModal.show();
            }
        });

        const redirectToOrderPage = () => {
            if (selectedTableNumber) {
                // Abrir a tela não ocupa a mesa. O servidor altera o status para
                // "atendimento" somente quando o primeiro item é salvo.
                window.location.href = `atendimento_pedido.html?mesa=${selectedTableNumber}`;
            }
        };

        modalStartOrderBtn.addEventListener('click', redirectToOrderPage);
        modalEditOrderBtn.addEventListener('click', redirectToOrderPage);
        
        modalChangeStatusBtn.addEventListener('click', () => {
            if(selectedTableNumber) {
                changeStatusTitle.textContent = `Alterar Status da Mesa ${selectedTableNumber}`;
                tableOptionsModal.hide();
                changeStatusModal.show();
            }
        });

        statusOptionButtons.forEach(button => {
            button.addEventListener('click', async () => {
                const newStatus = button.dataset.newStatus;
                if (selectedTableNumber && newStatus) {
                    try {
                        const updatedTable = await updateTableStatusByNumber(selectedTableNumber, newStatus);
                        const selectedButton = tablesGrid.querySelector(`[data-table-number="${selectedTableNumber}"]`);
                        if (selectedButton) selectedButton.dataset.status = updatedTable.status;

                        if (newStatus === 'disponivel') {
                            const openOrder = await requestJson(`/api/atendimento/mesas/${encodeURIComponent(selectedTableNumber)}/pedido`);
                            if (openOrder) {
                                await requestJson(`/api/atendimento/mesas/${encodeURIComponent(selectedTableNumber)}/finalizar`, { method: 'POST' });
                            }
                        }
                        updateTableDisplay();
                        changeStatusModal.hide();
                    } catch (error) {
                        alert(`Não foi possível alterar o status: ${error.message}`);
                    }
                }
            });
        });
        loadTables().catch(error => {
            console.error('Erro ao carregar mesas:', error);
            tablesGrid.innerHTML = '<p class="col-span-full text-center text-red-500">Não foi possível carregar as mesas.</p>';
        });
    }
    
    // --- LÓGICA DA PÁGINA DE ATENDIMENTO DE PEDIDO (PDV) ---
    if (!!document.getElementById('table-display') && !document.getElementById('table-select')) {
        const tableDisplay = document.getElementById('table-display');
        const menuItemsContainer = document.getElementById('menu-items');
        const orderItemsContainer = document.getElementById('order-items');
        const emptyOrderMessage = document.getElementById('empty-order-message');
        const subtotalEl = document.getElementById('subtotal');
        const serviceChargeEl = document.getElementById('service-charge');
        const totalEl = document.getElementById('total');
        const finalizeOrderBtn = document.getElementById('finalize-order-btn');

        const urlParams = new URLSearchParams(window.location.search);
        const tableNumber = urlParams.get('mesa');
        if (tableNumber) {
            tableDisplay.textContent = `MESA ${tableNumber}`;
        }

        let saveQueue = Promise.resolve();
        const saveOrder = () => {
            if (!tableNumber) return;
            const orderItems = [];
            orderItemsContainer.querySelectorAll('.order-item').forEach(itemEl => {
                orderItems.push({
                    name: itemEl.dataset.name,
                    price: parseFloat(itemEl.dataset.price),
                    quantity: parseInt(itemEl.querySelector('.item-quantity').textContent)
                });
            });

            saveQueue = saveQueue.then(() => requestJson(`/api/atendimento/mesas/${encodeURIComponent(tableNumber)}/pedido`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ items: orderItems })
            })).catch(error => alert(`Não foi possível salvar o pedido: ${error.message}`));
        };
        
        const updateTotals = (persist = true) => {
            let subtotal = 0;
            orderItemsContainer.querySelectorAll('.order-item').forEach(item => {
                subtotal += parseFloat(item.dataset.price) * parseInt(item.querySelector('.item-quantity').textContent);
            });
            const serviceCharge = subtotal * 0.10;
            const total = subtotal + serviceCharge;
            subtotalEl.textContent = `R$ ${subtotal.toFixed(2)}`;
            serviceChargeEl.textContent = `R$ ${serviceCharge.toFixed(2)}`;
            totalEl.textContent = `R$ ${total.toFixed(2)}`;
            emptyOrderMessage.classList.toggle('hidden', orderItemsContainer.children.length > 1);
            if (persist) saveOrder();
        };

        const createOrderItemElement = (name, price, quantity) => {
            const orderItem = document.createElement('div');
            orderItem.className = 'order-item flex justify-between items-center';
            orderItem.setAttribute('data-name', name);
            orderItem.setAttribute('data-price', price);
            orderItem.innerHTML = `
                <div>
                    <p class="font-semibold text-gray-800 dark:text-white">${name}</p>
                    <p class="text-sm text-gray-500">R$ ${price.toFixed(2)}</p>
                </div>
                <div class="flex items-center gap-3">
                    <button class="quantity-btn decrease-qty bg-gray-200 rounded-md px-2">-</button>
                    <span class="item-quantity font-bold">${quantity}</span>
                    <button class="quantity-btn increase-qty bg-gray-200 rounded-md px-2">+</button>
                    <button class="remove-item-btn text-red-500 hover:text-red-700"><i class="bi bi-trash-fill"></i></button>
                </div>
            `;
            orderItemsContainer.appendChild(orderItem);
        };

        const loadOrder = async () => {
            if (!tableNumber) return;
            await migrateLocalOrdersToMysql();
            const savedOrderData = await requestJson(`/api/atendimento/mesas/${encodeURIComponent(tableNumber)}/pedido`);
            orderItemsContainer.innerHTML = '';
            orderItemsContainer.appendChild(emptyOrderMessage);
            if (savedOrderData && savedOrderData.items && savedOrderData.items.length > 0) {
                savedOrderData.items.forEach(item => createOrderItemElement(item.nome, Number(item.preco_unitario), item.quantidade));
            }
            updateTotals(false);
        };

        menuItemsContainer.addEventListener('click', (event) => {
            const addButton = event.target.closest('.add-to-order-btn');
            if (addButton) {
                const menuItem = addButton.closest('.menu-item');
                const name = menuItem.dataset.name;
                const price = parseFloat(menuItem.dataset.price);
                const existingItem = orderItemsContainer.querySelector(`[data-name="${name}"]`);
                if (existingItem) {
                    const quantityEl = existingItem.querySelector('.item-quantity');
                    quantityEl.textContent = parseInt(quantityEl.textContent) + 1;
                } else {
                    createOrderItemElement(name, price, 1);
                }
                updateTotals();
            }
        });

        orderItemsContainer.addEventListener('click', (event) => {
            const orderItem = event.target.closest('.order-item');
            if (!orderItem) return;
            if (event.target.matches('.increase-qty')) {
                const quantityEl = orderItem.querySelector('.item-quantity');
                quantityEl.textContent = parseInt(quantityEl.textContent) + 1;
            } else if (event.target.matches('.decrease-qty')) {
                const quantityEl = orderItem.querySelector('.item-quantity');
                if (parseInt(quantityEl.textContent) > 1) {
                    quantityEl.textContent = parseInt(quantityEl.textContent) - 1;
                } else {
                    orderItem.remove();
                }
            } else if (event.target.closest('.remove-item-btn')) {
                orderItem.remove();
            }
            updateTotals();
        });
        
        finalizeOrderBtn.addEventListener('click', async () => {
            // Aguarda a última persistência antes de voltar para a lista de mesas.
            await saveQueue;
            window.location.href = 'atendimento_mesas.html';
        });

        loadOrder().catch(error => alert(`Não foi possível carregar o pedido: ${error.message}`));
    }

    // --- LÓGICA DA PÁGINA PDV ---
    const isPdvPage = !!document.getElementById('table-select');
    if(isPdvPage) {
        const tableSelect = document.getElementById('table-select');
        const orderItemsContainer = document.getElementById('order-items');
        const emptyOrderMessage = document.getElementById('empty-order-message');
        const subtotalEl = document.getElementById('subtotal');
        const serviceChargeEl = document.getElementById('service-charge');
        const totalEl = document.getElementById('total');
        const finalizeOrderBtn = document.getElementById('finalize-order-btn');
        const finalizeOrderModalElement = document.getElementById('finalize-order-modal');
        const finalizeOrderModal = new Modal(finalizeOrderModalElement);
        
        let currentTableNumber = null;
        let openOrdersByTable = new Map();

        const populateTableSelect = async () => {
            await migrateLocalOrdersToMysql();
            const orders = await requestJson('/api/atendimento/pedidos-abertos');
            openOrdersByTable = new Map(orders.map(order => [String(order.mesa_numero).padStart(2, '0'), order]));
            const tablesInService = [...openOrdersByTable.keys()];

            tableSelect.innerHTML = '<option selected disabled>Escolha uma mesa</option>';

            if (tablesInService.length > 0) {
                tablesInService.forEach(tableNumber => {
                    const option = document.createElement('option');
                    option.value = tableNumber;
                    option.textContent = `Mesa ${tableNumber}`;
                    tableSelect.appendChild(option);
                });
            }
        };

        const createOrderItemElement = (name, price, quantity) => {
            const orderItem = document.createElement('div');
            orderItem.className = 'order-item flex justify-between items-center';
            orderItem.setAttribute('data-name', name);
            orderItem.setAttribute('data-price', price);
            orderItem.innerHTML = `
                <div>
                    <p class="font-semibold text-gray-800 dark:text-white">${name}</p>
                    <p class="text-sm text-gray-500">R$ ${price.toFixed(2)}</p>
                </div>
                <div class="flex items-center gap-3">
                    <span class="font-bold">${quantity}x</span>
                </div>
            `;
            orderItemsContainer.appendChild(orderItem);
        }

        const loadOrderForTable = (tableNumber) => {
            currentTableNumber = tableNumber;
            const orderData = openOrdersByTable.get(String(tableNumber).padStart(2, '0'));
            
            orderItemsContainer.innerHTML = ''; 

            if (orderData && orderData.items && orderData.items.length > 0) {
                emptyOrderMessage.classList.add('hidden');
                orderData.items.forEach(item => {
                    createOrderItemElement(item.nome, Number(item.preco_unitario), item.quantidade);
                });
                finalizeOrderBtn.disabled = false;
            } else {
                orderItemsContainer.appendChild(emptyOrderMessage);
                emptyOrderMessage.textContent = 'Nenhum pedido para esta mesa.';
                emptyOrderMessage.classList.remove('hidden');
                finalizeOrderBtn.disabled = true;
            }
            updateTotals();
        };
        
        const updateTotals = () => {
             let subtotal = 0;
            orderItemsContainer.querySelectorAll('.order-item').forEach(item => {
                subtotal += parseFloat(item.dataset.price) * parseInt(item.querySelector('span.font-bold').textContent.replace('x',''));
            });
            const serviceCharge = subtotal * 0.10;
            const total = subtotal + serviceCharge;
            subtotalEl.textContent = `R$ ${subtotal.toFixed(2)}`;
            serviceChargeEl.textContent = `R$ ${serviceCharge.toFixed(2)}`;
            totalEl.textContent = `R$ ${total.toFixed(2)}`;
        };

        tableSelect.addEventListener('change', () => {
            loadOrderForTable(tableSelect.value);
        });

        finalizeOrderModalElement.addEventListener('click', async (event) => {
            const paymentButton = event.target.closest('.payment-method-btn');
            if (paymentButton) {
                const method = paymentButton.dataset.method;
                
                try {
                    await requestJson(`/api/atendimento/mesas/${encodeURIComponent(currentTableNumber)}/finalizar`, { method: 'POST' });
                } catch (error) {
                    alert(`Pagamento confirmado, mas não foi possível liberar a mesa: ${error.message}`);
                    return;
                }

                finalizeOrderModal.hide();
                alert(`Pagamento com ${method} confirmado! Mesa ${currentTableNumber} liberada.`);

                await populateTableSelect();
                orderItemsContainer.innerHTML = '';
                orderItemsContainer.appendChild(emptyOrderMessage);
                emptyOrderMessage.textContent = 'Selecione uma mesa para ver o pedido.';
                emptyOrderMessage.classList.remove('hidden');
                updateTotals();
                finalizeOrderBtn.disabled = true;
            }
        });

        populateTableSelect().catch(error => alert(`Não foi possível carregar os pedidos: ${error.message}`));
    }

    // --- LÓGICA DA PÁGINA PAINEL DA COZINHA ---
    const isKitchenPage = !!document.getElementById('kitchen-board');
    if(isKitchenPage) {
        const kitchenBoard = document.getElementById('kitchen-board');
        const receivedColumn = document.getElementById('received-column');
        const inProgressColumn = document.getElementById('in-progress-column');
        const completedColumn = document.getElementById('completed-column');
        const receivedCount = document.getElementById('received-count');
        const inProgressCount = document.getElementById('in-progress-count');
        const completedCount = document.getElementById('completed-count');
        const timers = {};

        const createOrderCard = (tableNumber, orderData) => {
            const itemsHtml = orderData.items.map(item => `
                <li class="text-sm text-gray-600 dark:text-gray-400">
                    <span class="font-semibold">${item.quantidade ?? item.quantity}x</span> ${item.nome ?? item.name}
                </li>
            `).join('');
            
            const createdAt = new Date(orderData.criado_em ?? orderData.createdAt);
            const formattedTime = createdAt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

            const card = document.createElement('div');
            card.className = 'order-card bg-white dark:bg-gray-700 p-4 rounded-lg shadow-md';
            card.setAttribute('data-table', tableNumber);
            card.setAttribute('data-order-id', orderData.id);
            card.innerHTML = `
                <div class="flex justify-between items-start mb-2">
                    <h3 class="font-bold text-lg text-gray-800 dark:text-white">Mesa ${tableNumber}</h3>
                    <span class="status-badge text-xs font-medium px-2.5 py-0.5 rounded"></span>
                </div>
                <div class="flex justify-between items-center text-xs text-gray-500 dark:text-gray-400 mb-2">
                    <span>Iniciado às: ${formattedTime}</span>
                    <span class="timer font-semibold"></span>
                </div>
                <ul class="space-y-1 mb-4 list-disc list-inside">${itemsHtml}</ul>
                <div class="flex justify-end gap-2">
                    <button class="text-xs font-medium text-gray-700 bg-gray-200 hover:bg-gray-300 px-3 py-1.5 rounded-md">Alerta</button>
                    <button class="conclude-btn text-xs font-medium text-white bg-green-500 hover:bg-green-600 px-3 py-1.5 rounded-md">Avançar</button>
                </div>
            `;
            return card;
        };

        const updateCardStatus = (card, newStatus) => {
            card.dataset.status = newStatus;
            const statusBadge = card.querySelector('.status-badge');
            const concludeBtn = card.querySelector('.conclude-btn');
            const tableNumber = card.dataset.table;

            if (timers[tableNumber]) {
                clearInterval(timers[tableNumber]);
                delete timers[tableNumber];
            }

            switch(newStatus) {
                case 'recebido':
                    statusBadge.textContent = 'Recebido';
                    statusBadge.className = 'status-badge bg-blue-100 text-blue-800 text-xs font-medium px-2.5 py-0.5 rounded';
                    break;
                case 'andamento':
                    statusBadge.textContent = 'Em Andamento';
                    statusBadge.className = 'status-badge bg-amber-100 text-amber-800 text-xs font-medium px-2.5 py-0.5 rounded';
                    const startTime = Date.now();
                    card.dataset.startTime = startTime;
                    timers[tableNumber] = setInterval(() => {
                        const elapsed = Math.floor((Date.now() - startTime) / 1000);
                        const minutes = String(Math.floor(elapsed / 60)).padStart(2, '0');
                        const seconds = String(elapsed % 60).padStart(2, '0');
                        card.querySelector('.timer').textContent = `${minutes}:${seconds}`;
                    }, 1000);
                    break;
                case 'concluido':
                    statusBadge.textContent = 'Concluído';
                    statusBadge.className = 'status-badge bg-green-100 text-green-800 text-xs font-medium px-2.5 py-0.5 rounded';
                    concludeBtn.textContent = 'Finalizado';
                    concludeBtn.disabled = true;
                    concludeBtn.classList.remove('bg-green-500', 'hover:bg-green-600');
                    concludeBtn.classList.add('bg-gray-400', 'cursor-not-allowed');
                    const finalTime = card.querySelector('.timer').textContent;
                    if (finalTime) {
                        card.querySelector('.timer').textContent = `Feito em: ${finalTime}`;
                    }
                    break;
            }
        };
        
        const updateCounts = () => {
             receivedCount.textContent = receivedColumn.children.length;
             inProgressCount.textContent = inProgressColumn.children.length;
             completedCount.textContent = completedColumn.children.length;
        };
        
        const loadOrders = async () => {
            await migrateLocalOrdersToMysql();
            const orders = await requestJson('/api/atendimento/pedidos-abertos');

            if (orders.length > 0) {
                receivedColumn.innerHTML = '';
                inProgressColumn.innerHTML = '';
                completedColumn.innerHTML = '';

                for (const orderData of orders) {
                    const tableNumber = String(orderData.mesa_numero).padStart(2, '0');
                    if (orderData && orderData.items.length > 0) {
                        const card = createOrderCard(tableNumber, orderData);
                        updateCardStatus(card, 'recebido');
                        receivedColumn.appendChild(card);
                    }
                }
            } else {
                document.querySelectorAll('#kitchen-board .order-card').forEach(card => {
                    const status = card.dataset.status;
                    if(status === 'andamento'){
                        updateCardStatus(card, 'andamento');
                    } else {
                        updateCardStatus(card, status);
                    }
                });
            }
            updateCounts();
        };

        kitchenBoard.addEventListener('click', (event) => {
            const concludeBtn = event.target.closest('.conclude-btn');
            if(concludeBtn && !concludeBtn.disabled) {
                const card = concludeBtn.closest('.order-card');
                const currentStatus = card.dataset.status;

                if (currentStatus === 'recebido') {
                    updateCardStatus(card, 'andamento');
                    inProgressColumn.appendChild(card);
                } else if (currentStatus === 'andamento') {
                    updateCardStatus(card, 'concluido');
                    completedColumn.appendChild(card);
                }
                updateCounts();
            }
        });

        loadOrders().catch(error => alert(`Não foi possível carregar a cozinha: ${error.message}`));
    }

    // --- LÓGICA DE LOGIN ---
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        const notification = document.getElementById('notification');
        const notificationMessage = document.getElementById('notification-message');
        const registerForm = document.getElementById('registerForm');
        const tabLogin = document.getElementById('tab-login');
        const tabRegister = document.getElementById('tab-register');
        const toRegisterBtn = document.getElementById('toRegister');
        const toLoginBtn = document.getElementById('toLogin');

        const showLoginForm = () => {
            tabLogin.classList.add('active');
            tabRegister.classList.remove('active');
            loginForm.style.display = 'flex';
            registerForm.style.display = 'none';
        };

        const showRegisterForm = () => {
            tabRegister.classList.add('active');
            tabLogin.classList.remove('active');
            registerForm.style.display = 'flex';
            loginForm.style.display = 'none';
        };

        tabLogin.addEventListener('click', showLoginForm);
        tabRegister.addEventListener('click', showRegisterForm);
        toRegisterBtn.addEventListener('click', showRegisterForm);
        toLoginBtn.addEventListener('click', showLoginForm);

        loginForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            event.stopImmediatePropagation();

            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;

            try {
                const response = await fetch('/api/auth/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, password })
                });

                if (!response.ok) {
                    throw new Error('Email ou senha invalidos.');
                }

                const data = await response.json();
                localStorage.setItem('authToken', data.token);
                localStorage.setItem('authUser', JSON.stringify(data.user));
                showNotification('Login realizado com sucesso! Redirecionando...', 'success');
                setTimeout(() => { window.location.href = 'dashboard.html'; }, 2000);
            } catch (error) {
                showNotification(error.message || 'Nao foi possivel realizar login.', 'error');
            }
        }, true);

        registerForm.addEventListener('submit', async (event) => {
            event.preventDefault();

            const name = document.getElementById('regName').value;
            const email = document.getElementById('regEmail').value;
            const password = document.getElementById('regPassword').value;
            const password2 = document.getElementById('regPassword2').value;

            if (password !== password2) {
                showNotification('As senhas nao conferem.', 'error');
                return;
            }

            try {
                const response = await fetch('/api/auth/register', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name, email, password })
                });

                if (!response.ok) {
                    const errorData = await response.json().catch(() => ({}));
                    throw new Error(errorData.error || 'Nao foi possivel criar a conta.');
                }

                showNotification('Conta criada com sucesso. Faca login para continuar.', 'success');
                registerForm.reset();
                showLoginForm();
            } catch (error) {
                showNotification(error.message || 'Nao foi possivel criar a conta.', 'error');
            }
        });

        loginForm.addEventListener('submit', (event) => {
            event.preventDefault();
            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;
            const correctEmail = 'admin@estoquefacil.com';
            const correctPassword = '1234';

            if (email === correctEmail && password === correctPassword) {
                showNotification('Login realizado com sucesso! Redirecionando...', 'success');
                setTimeout(() => { window.location.href = 'dashboard.html'; }, 2000);
            } else {
                showNotification('E-mail ou senha inválidos. Tente novamente.', 'error');
            }
        });

        function showNotification(message, type) {
            if (!notification || !notificationMessage) return;
            notificationMessage.textContent = message;
            notification.classList.remove('bg-green-500', 'bg-red-500', 'hidden');
            notification.classList.add(type === 'success' ? 'bg-green-500' : 'bg-red-500');
            notification.classList.remove('hidden');
            setTimeout(() => { notification.classList.add('hidden'); }, 3000);
        }
    }

    // --- LÓGICA DA PÁGINA DE CARDÁPIO PÚBLICO ---
    const productGrid = document.getElementById('product-grid');
    if (productGrid) {
        const categoryTabs = document.getElementById('category-tabs');
        const searchInput = document.getElementById('product-search');
        const productCards = productGrid.querySelectorAll('.product-card');

        const filterProducts = () => {
            const searchTerm = searchInput.value.toLowerCase();
            const activeTab = categoryTabs.querySelector('.active');
            const activeCategory = activeTab ? activeTab.parentElement.querySelector('a').dataset.category : 'todos';

            productCards.forEach(card => {
                const cardCategory = card.dataset.category;
                const cardText = card.textContent.toLowerCase();

                const categoryMatch = activeCategory === 'todos' || cardCategory === activeCategory;
                const searchMatch = cardText.includes(searchTerm);

                if (categoryMatch && searchMatch) {
                    card.style.display = '';
                } else {
                    card.style.display = 'none';
                }
            });
        };

        categoryTabs.addEventListener('click', (event) => {
            event.preventDefault();
            const clickedTabLink = event.target.closest('a.category-tab');
            if (!clickedTabLink) return;

            // Remove a classe ativa de todas as abas
            categoryTabs.querySelectorAll('a.category-tab').forEach(tab => {
                tab.classList.remove('active', 'text-orange-600', 'border-orange-600');
                tab.classList.add('border-transparent', 'hover:text-gray-600', 'hover:border-gray-300');
            });

            // Adiciona a classe ativa na aba clicada
            clickedTabLink.classList.add('active', 'text-orange-600', 'border-orange-600');
            clickedTabLink.classList.remove('border-transparent', 'hover:text-gray-600', 'hover:border-gray-300');

            filterProducts();
        });

        searchInput.addEventListener('input', filterProducts);
    }
});

// --- FUNÇÕES GLOBAIS DO CARRINHO (acessíveis por script_Modal.js) ---

function adicionarItemAoCarrinho(item) {
    const cart = window.getCart ? window.getCart() : [];
    cart.push(item);
    if (window.saveCart) {
        window.saveCart(cart);
    } else {
        const data = JSON.parse(localStorage.getItem('estoqueFacilData') || '{"cart":[]}');
        data.cart = cart;
        localStorage.setItem('estoqueFacilData', JSON.stringify(data));
    }
} window.adicionarItemAoCarrinho = adicionarItemAoCarrinho;

function limparCarrinho() {
    // Adicionado um parâmetro opcional para não mostrar o confirm
    const askConfirmation = arguments.length > 0 ? arguments[0] : true;
    
    if (askConfirmation && confirm('Tem certeza que deseja esvaziar o carrinho?')) {
        saveCart([]);
        renderizarCarrinho();
    } else if (!askConfirmation) {
        saveCart([]);
        renderizarCarrinho();
    }
} window.limparCarrinho = limparCarrinho;

function removerItemDoCarrinho(itemId) {
    let cart = getCart();
    cart = cart.filter(item => item.id !== itemId);
    saveCart(cart);
    renderizarCarrinho();
}
window.removerItemDoCarrinho = removerItemDoCarrinho;

    function updateCartIconCount() {
        const cartIconCount = document.getElementById('cart-item-count');
        if (cartIconCount) {
            const cart = getCart();
            const itemCount = cart.reduce((total, item) => total + Number(item.quantity || 1), 0);
            cartIconCount.textContent = itemCount;
            cartIconCount.classList.toggle('hidden', itemCount === 0);
        }
    } window.updateCartIconCount = updateCartIconCount;

function renderizarCarrinho() {
    const cart = getCart();
    const itemsContainer = document.getElementById('cart-items-container');
    const emptyMsg = document.getElementById('empty-cart-msg');
    const totalPriceEl = document.getElementById('cart-total-price');
    
    itemsContainer.innerHTML = ''; // Limpa a lista
    itemsContainer.appendChild(emptyMsg); // Adiciona a mensagem de volta

    let cartTotal = 0;

    if (cart.length > 0) {
        emptyMsg.style.display = 'none';
        cart.forEach((item, index) => {
            cartTotal += item.total;
            const extrasHtml = item.extras.map(extra => `<li>+ ${extra.text}</li>`).join('');
            const itemEl = document.createElement('div');
            itemEl.className = 'cart-item-card';
            itemEl.innerHTML = `
                <div class="flex-grow">
                    <p class="cart-item-name">${item.quantity}x ${item.name}</p>
                    <ul class="cart-item-extras">${extrasHtml}</ul>
                    ${item.observations ? `<p class="cart-item-obs">Obs: ${item.observations}</p>` : ''}
                </div>
                <div class="flex flex-col items-end">
                    <p class="cart-item-price">R$ ${item.total.toFixed(2)}</p>
                    <button onclick="removerItemDoCarrinho('${item.id}')" class="remove-item-btn">
                        <i class="bi bi-trash3-fill"></i>
                    </button>
                </div>
            `;
            itemsContainer.appendChild(itemEl);
        });
    } else {
        emptyMsg.style.display = 'block';
    }

    totalPriceEl.textContent = `R$ ${cartTotal.toFixed(2)}`;
    updateCartIconCount();
} window.renderizarCarrinho = renderizarCarrinho;

// Inicializa a contagem do ícone do carrinho ao carregar a página
updateCartIconCount();
