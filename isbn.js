// isbn.js

/**
 * Buscador de livros por ISBN utilizando a Google Books API
 * É aberta e não requer chave de API rígida para volumes básicos.
 */

export async function fetchBookByISBN(isbn) {
    // Remove qualquer traço ou espaços
    const cleanIsbn = isbn.replace(/[- ]/g, '');
    
    if (!cleanIsbn || cleanIsbn.length < 10) {
        throw new Error('ISBN inválido. Deve ter 10 ou 13 dígitos.');
    }

    try {
        const response = await fetch(`https://www.googleapis.com/books/v1/volumes?q=isbn:${cleanIsbn}`);
        const data = await response.json();

        if (!data.items || data.items.length === 0) {
            throw new Error('Nenhum livro encontrado com este ISBN.');
        }

        const volumeInfo = data.items[0].volumeInfo;
        
        let coverUrl = null;
        if (volumeInfo.imageLinks) {
            // Pega a melhor resolução possível (thumbnail -> small -> extra large etc)
            coverUrl = volumeInfo.imageLinks.thumbnail || volumeInfo.imageLinks.smallThumbnail;
            // Hack para pegar imagem de melhor qualidade pela google API
            if (coverUrl) {
                coverUrl = coverUrl.replace('zoom=1', 'zoom=2').replace('http:', 'https:');
            }
        }

        return {
            isbn: cleanIsbn,
            title: volumeInfo.title || 'Título Desconhecido',
            author: volumeInfo.authors ? volumeInfo.authors.join(', ') : 'Autor Desconhecido',
            pages: volumeInfo.pageCount || 0,
            coverUrl: coverUrl
        };
        
    } catch (error) {
        console.error('Erro ao buscar livro:', error);
        throw error;
    }
}
