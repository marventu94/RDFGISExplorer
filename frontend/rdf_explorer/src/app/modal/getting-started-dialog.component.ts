import { Component } from '@angular/core';
import { DialogModule, DialogRef } from '@angular/cdk/dialog';

@Component({
  selector: 'app-getting-started-dialog',
  standalone: true,
  imports: [DialogModule],
  template: `
    <div class="dialog-container">
      <button class="dialog-close" (click)="dialogRef.close()">&times;</button>

      <h3>Introducción</h3>
      <hr />

      <p class="just">
        Esta interfaz fue creada para facilitar el proceso de exploración y creación de consultas en bases de datos de
        grafos. En este tipo de base de datos la información es modelada como recursos los cuales son enlazados entre si por
        medio de propiedades (creando así un grafo dirigido).
      </p>
      <p class="just">
        Supongamos que queremos indicar que <b>Pedro</b> es un <b>Hombre</b> que <b>estudia</b> en la <b>UTFSM</b> y
        <b>María</b> es una <b>Mujer</b> que ya se <b>tituló</b> de la misma universidad. En una base de datos de grafos
        esta información será representada de la siguiente forma:
      </p>
      <div class="row">
        <div class="col-md-1"></div>
        <div class="col-md-9">
          <img class="c-img-full" src="/assets/images/example1.png" alt="Example 1" />
        </div>
      </div>

      <p class="just">
        Como podemos notar, todo recurso (borde azul) es definido por sus relaciones (incluso información como el nombre
        se guarda de esta forma!), por lo que la creación de consultas en este tipo de base de datos requerirá que las
        formulemos de la misma manera, por ejemplo, si queremos obtener todos los <b>hombres</b> que estudian en
        <b>UTFSM</b> generaremos un grafo de consulta como el siguiente:
      </p>
      <div class="row">
        <div class="col-md-2"></div>
        <div class="col-md-8">
          <img class="c-img-full" src="/assets/images/example2.png" alt="Example 2" />
        </div>
      </div>
      <p class="just">
        En esta consulta la información requerida está representada por la variable (borde verde)
        <b>?estudiante</b>. Podemos notar que la consulta <i>calza</i> en la información de ejemplo, por lo que
        <b>?estudiante</b> tomará el valor de <b>pedro</b> y de todo otro recurso que también <i>calce</i>.
      </p>
      <p class="just">
        Debemos tener en consideración que cualquier recurso como cualquier propiedad puede ser variable por lo que
        este tipo de base de datos nos da una gran flexibilidad a la hora de crear nuestras consultas.
      </p>

      <h3>Utilizando la interfaz</h3>
      <hr />

      <p class="just">
        Supongamos que queremos obtener todos los lagos de Chile disponibles en
        <span class="mono">www.wikidata.org</span> (inglés), la interfaz permite llegar a la misma consulta de múltiples
        formas, explicaremos en particular dos patrones: comenzar con una variable o comenzar con algo conocido.
      </p>

      <h4>Forma 1: Comenzando con una variable</h4>
      <p class="just">
        Lo primero es crear una nueva variable (shift + click) en la cual obtendremos lo que buscamos a la que
        llamaremos <b>?lakes</b>
      </p>
      <div class="row">
        <div class="col-md-1"></div>
        <div class="col-md-9">
          <img class="c-img-full" src="/assets/images/t1.gif" alt="T1" />
        </div>
      </div>
      <p class="just">
        Luego usamos la herramienta de búsqueda (&#128269;) para obtener la información que ya conocemos, en este caso
        que es un lago (lake) y que está en Chile:
      </p>
      <div class="row">
        <div class="col-md-1"></div>
        <div class="col-md-9">
          <img class="c-img-full" src="/assets/images/t2.gif" alt="T2" />
        </div>
      </div>
      <p class="just">
        Ahora generamos propiedades (apretando shift y arrastrando) desde nuestra variable <b>?lakes</b> a los recursos
        <b>Chile</b> y <b>Lake</b>
      </p>
      <div class="row">
        <div class="col-md-1"></div>
        <div class="col-md-9">
          <img class="c-img-full" src="/assets/images/t3.gif" alt="T3" />
        </div>
      </div>
      <p class="just">
        Las propiedades recién creadas son por defecto variables, debemos elegir entre los valores posibles la relación
        que queremos, para ello usamos la herramienta de edición (&#9998; click izquierdo en las propiedades recién creadas):
      </p>
      <div class="row">
        <div class="col-md-12">
          <img class="c-img-full" src="/assets/images/t4.gif" alt="T4" />
        </div>
      </div>
      <p class="just">
        Para la relación con <b>Chile</b> elegimos la propiedad <b>Country</b> mientras que para <b>Lake</b>
        seleccionamos <b>instance of</b> de esta manera señalamos que <b>?lakes</b> tiene como país Chile y es una
        instancia de Lago. Con esto la variable <b>?lakes</b> obtendrá los valores requeridos.
      </p>
      <div class="row">
        <div class="col-md-12">
          <img class="c-img-full" src="/assets/images/t5.gif" alt="T5" />
        </div>
      </div>

      <h4 class="mt-2">Forma 2: Comenzando con algo conocido</h4>
      <p class="just">
        Primero debemos buscar algo que conozcamos que satisfaga la consulta o parte de ella, en este caso sabemos que en
        Chile hay un lago que se llama <i>'Todos los santos'</i>, así que lo buscamos:
      </p>
      <div class="row">
        <div class="col-md-2"></div>
        <div class="col-md-8">
          <img class="c-img-full" src="/assets/images/t6.gif" alt="T6" />
        </div>
      </div>
      <p class="just">
        Ahora hacemos uso de la herramienta de descripción (&#9776; click izquierdo sobre el recurso), buscamos las
        propiedades y los valores que necesitamos para arrastrarlos y soltarlos en el creador de consultas:
      </p>
      <div class="row">
        <div class="col-md-1"></div>
        <div class="col-md-10">
          <img class="c-img-full" src="/assets/images/t7.gif" alt="T7" />
        </div>
      </div>
      <p class="just">
        Por último nos basta con transformar <b>Todos los Santos Lake</b> en una variable llamada
        <b>?lakes</b> que tendrá los resultados de la consulta.
      </p>
      <div class="row">
        <div class="col-md-1"></div>
        <div class="col-md-10">
          <img class="c-img-full" src="/assets/images/t8.gif" alt="T8" />
        </div>
      </div>
    </div>
  `,
  styles: [`
    .dialog-container {
      padding: 10px 20px 20px;
      max-height: 85vh;
      overflow-y: auto;
      position: relative;
      background: #fff;
      border-radius: 6px;
      max-width: 900px;
      margin: 0 auto;
    }
    .dialog-close {
      position: sticky;
      top: 0;
      float: right;
      background: none;
      border: none;
      font-size: 1.5rem;
      cursor: pointer;
      line-height: 1;
      z-index: 10;
    }
    h3 { margin-top: 0; }
    h4 { margin-bottom: 0.25rem; }
    hr { margin: 3px 0; }
    .just { text-align: justify; }
    .c-img-full { max-width: 100%; height: auto; }
    .mt-2 { margin-top: 0.5rem; }
    .mono { font-family: monospace; }
    .row { display: flex; flex-wrap: wrap; }
    .col-md-1 { flex: 0 0 8.333333%; max-width: 8.333333%; }
    .col-md-2 { flex: 0 0 16.666667%; max-width: 16.666667%; }
    .col-md-8 { flex: 0 0 66.666667%; max-width: 66.666667%; }
    .col-md-9 { flex: 0 0 75%; max-width: 75%; }
    .col-md-10 { flex: 0 0 83.333333%; max-width: 83.333333%; }
    .col-md-12 { flex: 0 0 100%; max-width: 100%; }
  `],
})
export class GettingStartedDialogComponent {
  constructor(public dialogRef: DialogRef<void>) {}
}
